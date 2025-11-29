
'use client';

import { useState, useEffect } from 'react';
import { doc, getFirestore, setDoc, onSnapshot } from 'firebase/firestore';
import { app } from '@/lib/firebase';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';

const db = getFirestore(app);

export interface AppSettings {
  allowTeamAssignment: boolean;
  festName: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const settingsDocRef = doc(db, 'settings', 'global');
    const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data() as AppSettings);
      } else {
        // Initialize with default settings if document doesn't exist
        setSettings({ allowTeamAssignment: true, festName: 'Fest Central' });
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSettingsChange = (key: keyof AppSettings, value: any) => {
    if (settings) {
      setSettings({ ...settings, [key]: value });
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, 'settings', 'global');
      await setDoc(settingsDocRef, settings, { merge: true });
      toast({
        title: "Settings Updated",
        description: `Your festival settings have been saved.`
      });
    } catch (error) {
      console.error("Error updating settings:", error);
      toast({
        title: "Error",
        description: "Failed to update settings.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
        <div className="flex items-center justify-center h-full">
            <Loader2 className="mr-2 h-8 w-8 animate-spin" />
            <span>Loading Settings...</span>
        </div>
    );
  }

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold font-headline">Settings</h1>
            <Button onClick={handleSaveSettings} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save All Settings
            </Button>
        </div>
        <Card>
            <CardHeader>
                <CardTitle>General Settings</CardTitle>
                <CardDescription>Manage global application settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label htmlFor="festName" className="text-base">Festival Name</Label>
                     <p className="text-sm text-muted-foreground">
                        This name will be used across the entire application, including on ID cards and public pages.
                    </p>
                    <Input
                        id="festName"
                        value={settings?.festName || ''}
                        onChange={(e) => handleSettingsChange('festName', e.target.value)}
                        placeholder="Enter the name of your festival"
                    />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                        <Label htmlFor="assignment-switch" className="text-base">
                            Enable Participant Assignment for Teams
                        </Label>
                        <p className="text-sm text-muted-foreground">
                           Allow team leaders to assign their participants to programs.
                        </p>
                    </div>
                    <Switch
                        id="assignment-switch"
                        checked={settings?.allowTeamAssignment ?? false}
                        onCheckedChange={(checked) => handleSettingsChange('allowTeamAssignment', checked)}
                    />
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
