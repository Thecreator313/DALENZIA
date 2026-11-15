'use client';

import { useState, useMemo, useRef } from 'react';
import {
  collection,
  doc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '@/lib/firebase';
import { useSharedCollection, useAppSettings } from '@/context/firestore-cache';
import type { Program } from '@/app/admin/programs/page';
import type { Participant } from '@/app/teams/add-participants/page';
import type { Team } from '@/app/admin/teams/page';
import type { Category } from '@/app/admin/categories/page';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Loader2,
  Search,
  PackageOpen,
  Users,
  Upload,
  Download,
  Printer,
  FileSpreadsheet,
  FileDown,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  UserCheck,
  Shield,
  Layers,
  Sparkles,
  Info,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

type Assignment = {
  id: string;
  programId: string;
  studentId: string;
  teamId: string;
  status?: 'cancelled';
};

type ProgramWithAssignments = Program & {
  categoryName: string;
  assignments: {
    teamId: string;
    teamName: string;
    participants: Participant[];
  }[];
  totalParticipantsCount: number;
  missingTeams: { id: string; name: string }[];
};

export default function ProgramCoordinationPage() {
  const { settings } = useAppSettings();
  const festName = settings?.festName || 'DALENZIA ARTS FEST';

  const { data: rawPrograms, loading: progsLoading } = useSharedCollection<Program>('programs');
  const { data: programCategories, loading: catsLoading } = useSharedCollection<Category>('programCategories');
  const { data: allTeams, loading: teamsLoading } = useSharedCollection<Team>('teams');
  const { data: allParticipants, loading: studentsLoading } = useSharedCollection<Participant>('students');
  const { data: allAssignments, loading: assignmentsLoading } = useSharedCollection<Assignment>('assignments');

  // Filters & State
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'individual' | 'group'>('all');
  const [modeFilter, setModeFilter] = useState<'all' | 'on-stage' | 'off-stage'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'assigned' | 'empty'>('all');
  const [teamFilter, setTeamFilter] = useState('all');

  // Expanded Accordion items
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  // Excel Upload state & Dialog
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState<'merge' | 'replace'>('merge');
  const [pendingExcelRows, setPendingExcelRows] = useState<{ 'Program Name': string; 'Chest Number': number }[]>([]);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [isReplaceAlertOpen, setIsReplaceAlertOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Process programs with assignment details & missing house detection
  const programs = useMemo<ProgramWithAssignments[]>(() => {
    const categoryMap = new Map(programCategories.map((c) => [c.id, c.name]));
    const teamMap = new Map(allTeams.map((t) => [t.id, t.name]));
    const studentMap = new Map(allParticipants.map((s) => [s.id, s]));

    const assignmentsByProgram = new Map<string, Assignment[]>();
    for (const a of allAssignments) {
      if (a.status === 'cancelled') continue;
      const list = assignmentsByProgram.get(a.programId);
      if (list) list.push(a);
      else assignmentsByProgram.set(a.programId, [a]);
    }

    return rawPrograms.map((programData) => {
      const assignmentsForProgram = assignmentsByProgram.get(programData.id) || [];
      const assignmentsByTeam = assignmentsForProgram.reduce((acc, assignment) => {
        if (!acc[assignment.teamId]) acc[assignment.teamId] = [];
        acc[assignment.teamId].push(assignment.studentId);
        return acc;
      }, {} as Record<string, string[]>);

      const assignedTeamIds = new Set(Object.keys(assignmentsByTeam));

      const programAssignments = Object.entries(assignmentsByTeam).map(([teamId, studentIds]) => {
        const participants = studentIds
          .map((studentId) => studentMap.get(studentId))
          .filter(Boolean) as Participant[];
        return {
          teamId,
          teamName: teamMap.get(teamId) || 'Unknown Team',
          participants: participants.sort((a, b) => a.chestNumber - b.chestNumber),
        };
      });

      const totalParticipantsCount = programAssignments.reduce(
        (sum, t) => sum + t.participants.length,
        0
      );

      // Teams that haven't assigned anyone yet
      const missingTeams = allTeams.filter((t) => !assignedTeamIds.has(t.id));

      return {
        ...programData,
        categoryName: categoryMap.get(programData.categoryId) || 'General Category',
        assignments: programAssignments,
        totalParticipantsCount,
        missingTeams,
      };
    });
  }, [rawPrograms, programCategories, allTeams, allParticipants, allAssignments]);

  const loading =
    progsLoading || catsLoading || teamsLoading || studentsLoading || assignmentsLoading;

  // Filtered Programs list (Supports searching program name, category, or participant name/chest number!)
  const filteredPrograms = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return programs.filter((program) => {
      // Category Filter
      if (categoryFilter !== 'all' && program.categoryId !== categoryFilter) return false;

      // Type Filter
      if (typeFilter !== 'all' && program.type !== typeFilter) return false;

      // Mode Filter
      if (modeFilter !== 'all' && program.mode !== modeFilter) return false;

      // Registration Status Filter
      if (statusFilter === 'assigned' && program.totalParticipantsCount === 0) return false;
      if (statusFilter === 'empty' && program.totalParticipantsCount > 0) return false;

      // Specific Team participating
      if (teamFilter !== 'all' && !program.assignments.some((a) => a.teamId === teamFilter)) {
        return false;
      }

      // Keyword Search
      if (q === '') return true;

      // Match program name or category
      if (
        program.name.toLowerCase().includes(q) ||
        program.categoryName.toLowerCase().includes(q)
      ) {
        return true;
      }

      // Match participant name or chest number inside this program!
      for (const team of program.assignments) {
        for (const p of team.participants) {
          if (
            p.name.toLowerCase().includes(q) ||
            String(p.chestNumber).includes(q)
          ) {
            return true;
          }
        }
      }

      return false;
    });
  }, [programs, searchTerm, categoryFilter, typeFilter, modeFilter, statusFilter, teamFilter]);

  // Overall Coordination Telemetry
  const telemetry = useMemo(() => {
    const totalProgramsCount = programs.length;
    const totalAssignmentsCount = allAssignments.filter((a) => a.status !== 'cancelled').length;
    const activeProgramsCount = programs.filter((p) => p.totalParticipantsCount > 0).length;
    const emptyProgramsCount = totalProgramsCount - activeProgramsCount;
    const registrationCoveragePct =
      totalProgramsCount > 0 ? Math.round((activeProgramsCount / totalProgramsCount) * 100) : 0;

    return {
      totalProgramsCount,
      totalAssignmentsCount,
      activeProgramsCount,
      emptyProgramsCount,
      registrationCoveragePct,
      totalTeamsCount: allTeams.length,
      totalStudentsCount: allParticipants.length,
    };
  }, [programs, allAssignments, allTeams, allParticipants]);

  // Expand / Collapse all accordion items
  const handleExpandAll = () => {
    setExpandedItems(filteredPrograms.map((p) => p.id));
  };

  const handleCollapseAll = () => {
    setExpandedItems([]);
  };

  // Trigger Excel File Selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet) as { 'Program Name': string; 'Chest Number': number }[];

        setPendingExcelRows(json);
        setIsUploadModalOpen(true);
      } catch (err) {
        console.error('Error reading Excel:', err);
        toast({ title: 'Error', description: 'Could not parse Excel file format.', variant: 'destructive' });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Execute Excel Import (Merge or Replace)
  const executeImport = async (replaceExisting: boolean) => {
    setIsUploading(true);
    try {
      const programsMap = new Map(programs.map((p) => [p.name.toLowerCase().trim(), p.id]));
      const participantsMap = new Map(
        allParticipants.map((p) => [p.chestNumber, { id: p.id, teamId: p.teamId }])
      );

      const batch = writeBatch(db);

      // If replacing all, clear existing assignments
      if (replaceExisting) {
        const assignmentsSnapshot = await getDocs(collection(db, 'assignments'));
        assignmentsSnapshot.forEach((d) => {
          batch.delete(d.ref);
        });
      }

      let importedCount = 0;
      let skippedCount = 0;

      for (const row of pendingExcelRows) {
        const programName = String(row['Program Name'] || '').toLowerCase().trim();
        const chestNumber = Number(row['Chest Number']);

        if (!programName || !chestNumber) {
          skippedCount++;
          continue;
        }

        const programId = programsMap.get(programName);
        const participantInfo = participantsMap.get(chestNumber);

        if (programId && participantInfo) {
          const assignmentRef = doc(collection(db, 'assignments'));
          batch.set(assignmentRef, {
            programId,
            studentId: participantInfo.id,
            teamId: participantInfo.teamId,
          });
          importedCount++;
        } else {
          skippedCount++;
        }
      }

      await batch.commit();

      toast({
        title: 'Import Successful',
        description: `Imported ${importedCount} participant assignments${skippedCount > 0 ? ` (${skippedCount} rows skipped/unmatched)` : ''}.`,
      });

      setIsUploadModalOpen(false);
      setIsReplaceAlertOpen(false);
      setPendingExcelRows([]);
    } catch (error) {
      console.error('Error importing assignments:', error);
      toast({ title: 'Import Failed', description: 'Failed to save assignments to database.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  // Download Sample Excel Template
  const handleDownloadTemplate = () => {
    const sampleRows = [
      { 'Program Name': programs[0]?.name || 'Elocution Malayalam', 'Chest Number': 101 },
      { 'Program Name': programs[0]?.name || 'Elocution Malayalam', 'Chest Number': 102 },
      { 'Program Name': programs[1]?.name || 'Mappilapattu', 'Chest Number': 103 },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows);
    worksheet['!cols'] = [{ wch: 32 }, { wch: 16 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sample Assignments');
    XLSX.writeFile(workbook, 'assignments_sample_template.xlsx');
  };

  // Export Complete Assignments to Excel (.xlsx)
  const handleDownloadExcel = () => {
    try {
      const dataToExport = [];
      for (const program of programs) {
        for (const assignment of program.assignments) {
          for (const participant of assignment.participants) {
            dataToExport.push({
              'Program Name': program.name,
              'Category': program.categoryName,
              'Type': program.type,
              'Mode': program.mode,
              'House / Team': assignment.teamName,
              'Participant Name': participant.name,
              'Chest Number': participant.chestNumber,
            });
          }
        }
      }

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      worksheet['!cols'] = [
        { wch: 30 },
        { wch: 20 },
        { wch: 14 },
        { wch: 14 },
        { wch: 22 },
        { wch: 24 },
        { wch: 14 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Assignments');
      const dateStr = new Date().toISOString().split('T')[0];
      XLSX.writeFile(workbook, `${festName.toLowerCase().replace(/\s+/g, '-')}-program-assignments-${dateStr}.xlsx`);

      toast({
        title: 'Export Complete',
        description: `Exported ${dataToExport.length} entries to Excel.`,
      });
    } catch (e) {
      console.error(e);
      toast({ title: 'Export Failed', description: 'Could not export Excel file.', variant: 'destructive' });
    }
  };

  // Export PDF Coordination Report
  const handleDownloadPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header Banner
      doc.setFillColor(15, 23, 42); // Slate 900
      doc.rect(0, 0, pageWidth, 28, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(255, 255, 255);
      doc.text(festName.toUpperCase(), 14, 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(203, 213, 225);
      doc.text('PROGRAM COORDINATION & PARTICIPANT ASSIGNMENT ROSTER', 14, 19);
      doc.text(`Generated: ${new Date().toLocaleString()} | Total Entries: ${telemetry.totalAssignmentsCount}`, 14, 25);

      const tableRows: any[] = [];
      programs.forEach((prog) => {
        if (prog.assignments.length === 0) {
          tableRows.push([prog.name, prog.categoryName, 'No Entries', '-', '-']);
        } else {
          prog.assignments.forEach((team) => {
            team.participants.forEach((p) => {
              tableRows.push([prog.name, prog.categoryName, team.teamName, p.chestNumber, p.name]);
            });
          });
        }
      });

      autoTable(doc, {
        startY: 34,
        head: [['Program Name', 'Category', 'House / Team', 'Chest #', 'Participant Name']],
        body: tableRows,
        headStyles: {
          fillColor: [79, 70, 229], // Indigo 600
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        bodyStyles: {
          fontSize: 8,
          cellPadding: 2.5,
        },
      });

      const dateStr = new Date().toISOString().split('T')[0];
      doc.save(`${festName.toLowerCase().replace(/\s+/g, '-')}-coordination-report-${dateStr}.pdf`);

      toast({ title: 'PDF Downloaded', description: 'Program coordination roster saved as PDF.' });
    } catch (e) {
      console.error(e);
      toast({ title: 'PDF Failed', description: 'Could not generate PDF report.', variant: 'destructive' });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[65vh]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-xl animate-pulse" />
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500 relative z-10" />
        </div>
        <p className="text-muted-foreground animate-pulse mt-4 text-sm font-medium">
          Loading Program Coordination Records...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 relative min-h-screen p-1 pb-16">
      {/* Background Ambient Glows */}
      <div className="fixed inset-0 -z-10 h-full w-full bg-background overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-indigo-500/5 blur-[130px]" />
        <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/5 blur-[130px]" />
        <div className="absolute bottom-[-10%] left-[20%] w-[40%] h-[40%] rounded-full bg-cyan-500/5 blur-[140px]" />
      </div>

      {/* Top Header & Action Controls */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print"
      >
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-extrabold tracking-tight font-headline">Program Coordination</h1>
            <Badge variant="outline" className="bg-indigo-500/10 text-indigo-500 border-indigo-500/25 text-xs font-semibold px-2.5 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse mr-1.5 inline-block" />
              Roster & Entries
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Review event allocations, audit house participant entries, and manage bulk spreadsheet imports.
          </p>
        </div>

        {/* Global Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="border-border/60 hover:bg-muted text-xs rounded-xl"
          >
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Print
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            className="border-border/60 hover:bg-muted text-xs rounded-xl"
          >
            <FileDown className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            Template
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadExcel}
            className="border-border/60 hover:bg-muted text-xs rounded-xl"
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
            Excel Export
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPDF}
            className="border-border/60 hover:bg-muted text-xs rounded-xl"
          >
            <Download className="mr-1.5 h-3.5 w-3.5 text-indigo-500" />
            PDF Roster
          </Button>

          <Button
            onClick={() => fileInputRef.current?.click()}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold shadow-md shadow-indigo-500/20 text-xs sm:text-sm rounded-xl"
          >
            <Upload className="mr-1.5 h-4 w-4" />
            Import XLSX
          </Button>

          <Input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelect}
            accept=".xlsx, .xls"
          />
        </div>
      </motion.div>

      {/* KPI Metrics Summary Bar */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 no-print"
      >
        {/* Total Programs */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm relative overflow-hidden group hover:border-indigo-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl group-hover:bg-indigo-500/20 transition-all pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">Scheduled Programs</CardDescription>
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black font-mono mt-1">
              {telemetry.totalProgramsCount}{' '}
              <span className="text-xs font-normal text-muted-foreground font-sans">Events</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              {telemetry.activeProgramsCount} active with contenders
            </p>
          </CardContent>
        </Card>

        {/* Total Assigned Entries */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm relative overflow-hidden group hover:border-purple-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-xl group-hover:bg-purple-500/20 transition-all pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">Total Contestant Entries</CardDescription>
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                <UserCheck className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black font-mono mt-1 text-purple-500">
              {telemetry.totalAssignmentsCount}{' '}
              <span className="text-xs font-normal text-muted-foreground font-sans">Allocations</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              Across {telemetry.totalTeamsCount} competing houses
            </p>
          </CardContent>
        </Card>

        {/* Registration Coverage Progress */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm relative overflow-hidden group hover:border-emerald-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">Entry Coverage</CardDescription>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black font-mono mt-1">
              {telemetry.activeProgramsCount}{' '}
              <span className="text-sm font-normal text-muted-foreground font-sans">
                / {telemetry.totalProgramsCount}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>Programs Populated</span>
              <span className="font-semibold text-foreground font-mono">{telemetry.registrationCoveragePct}%</span>
            </div>
            <Progress value={telemetry.registrationCoveragePct} className="h-1.5" />
          </CardContent>
        </Card>

        {/* Empty / Unfilled Programs Warning */}
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm relative overflow-hidden group hover:border-amber-500/40 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-medium">Pending Registration</CardDescription>
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black font-mono mt-1 text-amber-500">
              {telemetry.emptyProgramsCount}{' '}
              <span className="text-xs font-normal text-muted-foreground font-sans">Empty</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              Programs with 0 participants assigned
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* FILTER & SEARCH TOOLBAR */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="no-print"
      >
        <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
          <div className="p-4 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Search with smart participant/chest search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by program, student name, or chest number (e.g. '105')..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs bg-background/60 border-border/50 focus:bg-background rounded-xl"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Filters Row */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Category Filter */}
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[145px] h-9 text-xs rounded-xl bg-background/60 border-border/50">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {programCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Type Filter */}
                <Select value={typeFilter} onValueChange={(val: any) => setTypeFilter(val)}>
                  <SelectTrigger className="w-[125px] h-9 text-xs rounded-xl bg-background/60 border-border/50">
                    <SelectValue placeholder="Event Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="group">Group Events</SelectItem>
                  </SelectContent>
                </Select>

                {/* Mode Filter */}
                <Select value={modeFilter} onValueChange={(val: any) => setModeFilter(val)}>
                  <SelectTrigger className="w-[130px] h-9 text-xs rounded-xl bg-background/60 border-border/50">
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Modes</SelectItem>
                    <SelectItem value="on-stage">On-Stage Only</SelectItem>
                    <SelectItem value="off-stage">Off-Stage Only</SelectItem>
                  </SelectContent>
                </Select>

                {/* Registration Status */}
                <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
                  <SelectTrigger className="w-[135px] h-9 text-xs rounded-xl bg-background/60 border-border/50">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="assigned">Has Contenders</SelectItem>
                    <SelectItem value="empty">Empty / Pending</SelectItem>
                  </SelectContent>
                </Select>

                {/* House / Team Filter */}
                <Select value={teamFilter} onValueChange={setTeamFilter}>
                  <SelectTrigger className="w-[140px] h-9 text-xs rounded-xl bg-background/60 border-border/50">
                    <SelectValue placeholder="House Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Houses</SelectItem>
                    {allTeams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quick Expand / Collapse & Counter */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
              <span>
                Displaying <strong>{filteredPrograms.length}</strong> of {programs.length} programs
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleExpandAll}
                  className="h-7 px-2 text-xs hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className="mr-1 h-3.5 w-3.5" />
                  Expand All
                </Button>
                <span>•</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCollapseAll}
                  className="h-7 px-2 text-xs hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <ChevronUp className="mr-1 h-3.5 w-3.5" />
                  Collapse All
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* PROGRAMS ACCORDION ROSTER */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Card className="border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden">
          <CardContent className="p-0">
            <Accordion
              type="multiple"
              value={expandedItems}
              onValueChange={setExpandedItems}
              className="w-full"
            >
              {filteredPrograms.map((program, idx) => {
                const isAssigned = program.totalParticipantsCount > 0;
                const isGroup = program.type === 'group';

                return (
                  <AccordionItem
                    value={program.id}
                    key={program.id}
                    className="border-b border-border/40 last:border-b-0 group"
                  >
                    <AccordionTrigger className="hover:no-underline p-4 px-5 hover:bg-muted/30 transition-colors">
                      <div className="flex flex-col md:flex-row md:items-center justify-between w-full text-left gap-3 pr-2">
                        {/* Title & Category Info */}
                        <div className="flex items-start md:items-center gap-3 min-w-0">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-mono font-bold text-muted-foreground">
                            #{idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-base text-foreground group-hover:text-indigo-500 transition-colors">
                                {program.name}
                              </h3>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] px-2 py-0',
                                  program.mode === 'on-stage'
                                    ? 'bg-purple-500/10 text-purple-400 border-purple-500/25'
                                    : 'bg-muted text-muted-foreground'
                                )}
                              >
                                {program.mode === 'on-stage' ? 'On-Stage' : 'Off-Stage'}
                              </Badge>
                              {isGroup && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  Group ({program.groupMembers || 'N/A'} members)
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Category: <strong className="text-foreground">{program.categoryName}</strong>
                            </p>
                          </div>
                        </div>

                        {/* Participation Pills */}
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant={isAssigned ? 'secondary' : 'outline'}
                            className={cn(
                              'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1',
                              isAssigned
                                ? 'bg-indigo-500/15 text-indigo-500 border border-indigo-500/30'
                                : 'border-dashed border-amber-500/40 text-amber-500 bg-amber-500/5'
                            )}
                          >
                            <Users className="h-3.5 w-3.5" />
                            <span>
                              {program.totalParticipantsCount}{' '}
                              {program.totalParticipantsCount === 1 ? 'Contender' : 'Contenders'}
                            </span>
                          </Badge>

                          <Badge variant="outline" className="text-xs font-mono px-2 py-1">
                            {program.assignments.length} / {allTeams.length} Houses
                          </Badge>
                        </div>
                      </div>
                    </AccordionTrigger>

                    <AccordionContent className="p-5 pt-2 border-t border-border/30 bg-muted/10 space-y-4">
                      {/* Missing Houses Alert (if any house hasn't registered) */}
                      {program.missingTeams.length > 0 && (
                        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 flex items-center justify-between text-xs gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                            <span className="text-muted-foreground">
                              Houses not yet registered for this event:{' '}
                              <strong className="text-foreground">
                                {program.missingTeams.map((t) => t.name).join(', ')}
                              </strong>
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-amber-500 shrink-0">
                            {program.missingTeams.length} Houses Pending
                          </span>
                        </div>
                      )}

                      {/* Team Assignment Cards Grid */}
                      {program.assignments.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          {program.assignments.map((assignment) => (
                            <Card
                              key={assignment.teamId}
                              className="border-border/50 bg-background/60 shadow-xs overflow-hidden"
                            >
                              <CardHeader className="p-3.5 pb-2.5 bg-muted/30 border-b border-border/40">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Avatar className="h-6 w-6 border border-border">
                                      <AvatarFallback className="text-[10px] font-bold bg-muted">
                                        {assignment.teamName.charAt(0)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <CardTitle className="text-sm font-bold truncate">
                                      {assignment.teamName}
                                    </CardTitle>
                                  </div>
                                  <Badge variant="outline" className="text-[10px] font-mono">
                                    {assignment.participants.length}{' '}
                                    {assignment.participants.length === 1 ? 'Contender' : 'Contenders'}
                                  </Badge>
                                </div>
                              </CardHeader>
                              <CardContent className="p-0">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="border-border/30 hover:bg-transparent">
                                      <TableHead className="w-20 text-xs py-2">Chest #</TableHead>
                                      <TableHead className="text-xs py-2">Participant</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {assignment.participants.map((p) => (
                                      <TableRow
                                        key={p.id}
                                        className="border-border/20 hover:bg-muted/30"
                                      >
                                        <TableCell className="font-mono font-bold text-xs py-2 text-foreground">
                                          #{p.chestNumber}
                                        </TableCell>
                                        <TableCell className="font-medium text-xs py-2">
                                          {p.name}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-10 bg-background/40 rounded-xl border border-dashed border-border/60">
                          <PackageOpen className="mx-auto h-9 w-9 text-muted-foreground/30 mb-2" />
                          <h4 className="font-semibold text-sm">No Entries Registered</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            No team leaders have allocated participants to this event yet.
                          </p>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}

              {filteredPrograms.length === 0 && (
                <div className="text-center py-20 text-muted-foreground">
                  <PackageOpen className="mx-auto h-12 w-12 opacity-30 mb-2" />
                  <h4 className="font-semibold text-base">No Matching Programs</h4>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    No programs matched your search keyword or selected filter criteria. Try resetting your search.
                  </p>
                </div>
              )}
            </Accordion>
          </CardContent>
        </Card>
      </motion.div>

      {/* EXCEL IMPORT CONFIRMATION & MODE MODAL */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border-border/50">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Upload className="h-5 w-5 text-indigo-500" />
              Import Assignments Spreadsheet
            </DialogTitle>
            <DialogDescription className="text-xs">
              File: <strong className="text-foreground">{selectedFileName}</strong> ({pendingExcelRows.length} data rows detected).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3.5 rounded-xl border border-border/50 bg-muted/20 space-y-2 text-xs">
              <div className="flex items-center justify-between font-semibold">
                <span>Select Import Mode:</span>
              </div>

              {/* Mode Option 1: Safe Merge (Default) */}
              <div
                onClick={() => setUploadMode('merge')}
                className={cn(
                  'p-3 rounded-lg border transition-all cursor-pointer space-y-1',
                  uploadMode === 'merge'
                    ? 'border-indigo-500/50 bg-indigo-500/10'
                    : 'border-border/40 bg-card hover:bg-muted/40'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">Merge & Update (Recommended)</span>
                  {uploadMode === 'merge' && <CheckCircle2 className="h-4 w-4 text-indigo-500" />}
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Adds new program assignments and leaves existing assignments untouched.
                </p>
              </div>

              {/* Mode Option 2: Full Overwrite */}
              <div
                onClick={() => setUploadMode('replace')}
                className={cn(
                  'p-3 rounded-lg border transition-all cursor-pointer space-y-1',
                  uploadMode === 'replace'
                    ? 'border-destructive/50 bg-destructive/10'
                    : 'border-border/40 bg-card hover:bg-muted/40'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-destructive">Replace All Existing Assignments</span>
                  {uploadMode === 'replace' && <AlertTriangle className="h-4 w-4 text-destructive" />}
                </div>
                <p className="text-muted-foreground text-[11px]">
                  ⚠️ Deletes all previous festival assignments before importing new ones.
                </p>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Required Excel column headers: <code>Program Name</code> and <code>Chest Number</code>.
            </p>
          </div>

          <DialogFooter className="pt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="text-xs rounded-xl" disabled={isUploading}>
                Cancel
              </Button>
            </DialogClose>

            <Button
              onClick={() => {
                if (uploadMode === 'replace') {
                  setIsReplaceAlertOpen(true);
                } else {
                  executeImport(false);
                }
              }}
              disabled={isUploading || pendingExcelRows.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl"
            >
              {isUploading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Start Import ({pendingExcelRows.length} rows)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REPLACE WARNING CONFIRMATION DIALOG */}
      <AlertDialog open={isReplaceAlertOpen} onOpenChange={setIsReplaceAlertOpen}>
        <AlertDialogContent className="bg-background/95 backdrop-blur-xl border-border/50 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Erase All Existing Assignments?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              This will permanently delete all {telemetry.totalAssignmentsCount} current festival assignments
              and replace them strictly with the records from the uploaded spreadsheet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => executeImport(true)}
              disabled={isUploading}
              className="bg-destructive hover:bg-destructive/90 text-white font-semibold text-xs rounded-xl"
            >
              {isUploading ? 'Importing...' : 'Yes, Replace Everything'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
