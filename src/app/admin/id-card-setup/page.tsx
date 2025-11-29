
'use client';

import { useState, useEffect } from 'react';
import {
  collection,
  getFirestore,
  onSnapshot,
  doc,
  getDoc,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { app } from '@/lib/firebase';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, Contact, FileText, QrCode } from 'lucide-react';
import type { Program } from '@/app/admin/programs/page';
import type { Participant as BaseParticipant } from '@/app/teams/add-participants/page';
import type { Team } from '@/app/admin/teams/page';
import type { Category } from '@/app/admin/categories/page';
import type { AppSettings } from '@/app/admin/settings/page';

const db = getFirestore(app);

type Assignment = { id: string; programId: string; studentId: string; teamId: string; };

export default function IdCardSetupPage() {
  const [loading, setLoading] = useState(true);
  const [isDownloadingXLSX, setIsDownloadingXLSX] = useState(false);
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
  const [isDownloadingQRCodes, setIsDownloadingQRCodes] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState('all');

  const [programs, setPrograms] = useState<Program[]>([]);
  const [participants, setParticipants] = useState<BaseParticipant[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [memberCategories, setMemberCategories] = useState<Category[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  
  useEffect(() => {
    setLoading(true);
    const collectionsToFetch = [
      { name: 'programs', setter: setPrograms },
      { name: 'students', setter: setParticipants },
      { name: 'teams', setter: setTeams },
      { name: 'memberCategories', setter: setMemberCategories },
      { name: 'assignments', setter: setAssignments },
    ];
    
    let loadedCount = 0;
    const totalCollections = collectionsToFetch.length + 1; // +1 for settings

    const unsubscribes = collectionsToFetch.map(({ name, setter }) => {
        return onSnapshot(collection(db, name), (snapshot) => {
            setter(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
            loadedCount++;
            if (loadedCount === totalCollections) setLoading(false);
        }, (error) => {
            console.error(`Error fetching ${name}:`, error);
            loadedCount++;
            if (loadedCount === totalCollections) setLoading(false);
        });
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      setSettings(snap.data() as AppSettings);
      loadedCount++;
      if (loadedCount === totalCollections) setLoading(false);
    });
    unsubscribes.push(unsubSettings);


    return () => unsubscribes.forEach(unsub => unsub());
  }, []);

  const getFilteredParticipants = () => {
     return selectedTeam === 'all' 
      ? participants 
      : participants.filter(p => p.teamId === selectedTeam);
  }

  const handleDownloadXLSX = () => {
    setIsDownloadingXLSX(true);

    const filteredParticipants = getFilteredParticipants();
    const teamMap = new Map(teams.map(t => [t.id, t.name]));
    const categoryMap = new Map(memberCategories.map(c => [c.id, c.name]));
    const programMap = new Map(programs.map(p => [p.id, p.name]));

    const dataForExport = filteredParticipants.map(participant => {
      const assignedProgramIds = assignments
        .filter(a => a.studentId === participant.id)
        .map(a => a.programId);
      
      const assignedProgramNames = assignedProgramIds
        .map(id => programMap.get(id))
        .filter(Boolean)
        .join(', ');
      
      const qrCodeValue = participant.chestNumber.toString();

      return {
        'Chest Number': participant.chestNumber,
        'Name': participant.name,
        'Team': teamMap.get(participant.teamId) || 'N/A',
        'Category': categoryMap.get(participant.categoryId) || 'N/A',
        'QR Code Data': qrCodeValue,
        'Assigned Programs': assignedProgramNames,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataForExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "ID Card Data");
    XLSX.writeFile(workbook, `id-card-data-${selectedTeam === 'all' ? 'all-teams' : teamMap.get(selectedTeam)}.xlsx`);
    
    setIsDownloadingXLSX(false);
  };
  
  const handleDownloadPDF = async () => {
    setIsDownloadingPDF(true);

    const filteredParticipants = getFilteredParticipants();
    const teamMap = new Map(teams.map(t => [t.id, t.name]));
    const categoryMap = new Map(memberCategories.map(c => [c.id, c.name]));
    const festName = settings?.festName || 'Fest Central';

    const doc = new jsPDF();
    const cardWidth = 85.6;
    const cardHeight = 53.98;
    const margin = 10;
    const cardsPerPage = 8;
    let cardsDrawn = 0;

    for (const participant of filteredParticipants) {
        if (cardsDrawn > 0 && cardsDrawn % cardsPerPage === 0) {
            doc.addPage();
        }
        
        const pageIndex = Math.floor(cardsDrawn / cardsPerPage);
        const cardIndexOnPage = cardsDrawn % cardsPerPage;
        
        const x = margin + (cardIndexOnPage % 2) * (cardWidth + margin);
        const y = margin + Math.floor(cardIndexOnPage / 2) * (cardHeight + margin);

        // --- Background Gradient ---
        const gradientStops = [
            { offset: 0, color: [13, 27, 76] }, // Deep navy blue
            { offset: 1, color: [26, 58, 154] }, // Royal blue
        ];

        const steps = 100;
        for (let i = 0; i < steps; i++) {
            const ratio = i / steps;
            const r = Math.round(gradientStops[0].color[0] + (gradientStops[1].color[0] - gradientStops[0].color[0]) * ratio);
            const g = Math.round(gradientStops[0].color[1] + (gradientStops[1].color[1] - gradientStops[0].color[1]) * ratio);
            const b = Math.round(gradientStops[0].color[2] + (gradientStops[1].color[2] - gradientStops[0].color[2]) * ratio);
            doc.setFillColor(r, g, b);
            doc.rect(x + (i * cardWidth / steps), y, cardWidth / steps, cardHeight, 'F');
        }

        // --- Rounded corner clipping ---
        doc.roundedRect(x, y, cardWidth, cardHeight, 3, 3, 'S');

        // --- Content ---
        
        // QR Code
        try {
            const qrCodeValue = participant.chestNumber.toString();
            const qrCodeDataUrl = await QRCode.toDataURL(qrCodeValue, { 
                errorCorrectionLevel: 'H', 
                margin: 1, 
                color: { dark: '#FFFFFF', light: '#0000' } // White QR code, transparent background
            });
            doc.addImage(qrCodeDataUrl, 'PNG', x + cardWidth - 30, y + 5, 25, 25);
        } catch (err) {
            console.error(err);
        }

        // Event Title
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(festName, x + 8, y + 12);
        
        // Decorative line
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.2);
        doc.line(x + 8, y + 14, x + 35, y + 14);

        // Participant Name
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(participant.name, x + 8, y + 25, { maxWidth: cardWidth - 45 });

        // Details
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(220, 220, 220);
        doc.text(`Chest No: ${participant.chestNumber}`, x + 8, y + 38);
        doc.text(`Team: ${teamMap.get(participant.teamId) || 'N/A'}`, x + 8, y + 43);
        doc.text(`Category: ${categoryMap.get(participant.categoryId) || 'N/A'}`, x + 8, y + 48);
        
        cardsDrawn++;
    }

    doc.save(`id-cards-${selectedTeam === 'all' ? 'all' : teamMap.get(selectedTeam)}.pdf`);

    setIsDownloadingPDF(false);
  }

  const handleDownloadQRCodes = async () => {
    setIsDownloadingQRCodes(true);
    const zip = new JSZip();
    const filteredParticipants = getFilteredParticipants();

    for (const participant of filteredParticipants) {
        const qrCodeValue = participant.chestNumber.toString();
        try {
            const dataUrl = await QRCode.toDataURL(qrCodeValue, { errorCorrectionLevel: 'H' });
            // The dataUrl is "data:image/png;base64,iVBORw0KGgoAAA..."
            // We need to extract the base64 part.
            const base64Data = dataUrl.substring(dataUrl.indexOf(',') + 1);
            zip.file(`${participant.chestNumber}.png`, base64Data, { base64: true });
        } catch (err) {
            console.error(`Failed to generate QR code for ${participant.name}:`, err);
        }
    }

    zip.generateAsync({ type: 'blob' }).then((content) => {
        const teamName = selectedTeam === 'all' ? 'all-teams' : teams.find(t => t.id === selectedTeam)?.name || 'team';
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `qrcodes-${teamName}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    });

    setIsDownloadingQRCodes(false);
};

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="mr-2 h-8 w-8 animate-spin" />
        <span>Loading Data for ID Cards...</span>
      </div>
    );
  }
  
  const isAnyDownloadInProgress = isDownloadingXLSX || isDownloadingPDF || isDownloadingQRCodes;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold font-headline">ID Card Setup</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Contact /> Generate ID Card Data
          </CardTitle>
          <CardDescription>
            Download an XLSX file for mail merge, a print-ready PDF of all ID cards, or a ZIP file of QR codes.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <div className="max-w-md space-y-2">
                <label htmlFor="team-select" className="text-sm font-medium">Select a Team</label>
                <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                    <SelectTrigger id="team-select">
                        <SelectValue placeholder="Select a team..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Teams</SelectItem>
                        {teams.map(team => (
                            <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                 <p className="text-xs text-muted-foreground">
                    Choose a specific team or all teams to include in the downloads.
                </p>
            </div>
        </CardContent>
        <CardFooter className="flex-wrap gap-4">
          <Button onClick={handleDownloadXLSX} disabled={isAnyDownloadInProgress}>
            {isDownloadingXLSX ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Download XLSX
          </Button>
           <Button onClick={handleDownloadPDF} disabled={isAnyDownloadInProgress} variant="secondary">
            {isDownloadingPDF ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download ID Cards (PDF)
          </Button>
           <Button onClick={handleDownloadQRCodes} disabled={isAnyDownloadInProgress} variant="outline">
            {isDownloadingQRCodes ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
            Download QR Codes (ZIP)
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
