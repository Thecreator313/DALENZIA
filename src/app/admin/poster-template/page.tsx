'use client';

import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, getFirestore } from 'firebase/firestore';
import { app } from '@/lib/firebase';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, Save, RefreshCw, Type, Image as ImageIcon, Layout } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { HexColorPicker } from "react-colorful";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const db = getFirestore(app);
const IMGBB_API_KEY = 'feb010b50bb6cec41cb64ca52cf9c848';

type TextStyle = {
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontWeight: string;
  textAlign: 'left' | 'center' | 'right';
  isVisible: boolean;
};

type PosterSettings = {
  backgroundImageUrl: string;
  programName: TextStyle;
  categoryName: TextStyle;
  winner1: TextStyle;
  winner2: TextStyle;
  winner3: TextStyle;
};

const defaultTextStyle: TextStyle = {
  x: 50,
  y: 50,
  fontSize: 24,
  color: '#ffffff',
  fontWeight: 'bold',
  textAlign: 'center',
  isVisible: true,
};

const defaultSettings: PosterSettings = {
  backgroundImageUrl: '',
  programName: { ...defaultTextStyle, y: 20, fontSize: 40 },
  categoryName: { ...defaultTextStyle, y: 30, fontSize: 20, fontWeight: 'normal' },
  winner1: { ...defaultTextStyle, y: 50, fontSize: 30, color: '#FFD700' },
  winner2: { ...defaultTextStyle, y: 65, fontSize: 24, color: '#C0C0C0' },
  winner3: { ...defaultTextStyle, y: 75, fontSize: 24, color: '#CD7F32' },
};

export default function PosterTemplatePage() {
  const [settings, setSettings] = useState<PosterSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('background');
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const docRef = doc(db, 'settings', 'posterTemplate');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setSettings(docSnap.data() as PosterSettings);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
      toast({
        title: "Error",
        description: "Failed to load poster settings.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'posterTemplate'), settings);
      toast({
        title: "Success",
        description: "Poster template saved successfully.",
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: "Error",
        description: "Failed to save poster settings.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (data.success) {
        setSettings(prev => ({ ...prev, backgroundImageUrl: data.data.url }));
        toast({
          title: "Success",
          description: "Background image uploaded successfully.",
        });
      } else {
        throw new Error(data.error?.message || 'Upload failed');
      }
    } catch (error) {
      console.error("Error uploading image:", error);
      toast({
        title: "Error",
        description: "Failed to upload image to ImgBB.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const updateTextStyle = (key: keyof PosterSettings, field: keyof TextStyle, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] as TextStyle),
        [field]: value,
      },
    }));
  };

  const renderControlGroup = (label: string, key: keyof PosterSettings) => {
    const style = settings[key] as TextStyle;
    return (
      <div className="space-y-4 p-4 border rounded-lg bg-card/50">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">{label}</Label>
          <div className="flex items-center gap-2">
            <Label htmlFor={`${key}-visible`} className="text-xs">Visible</Label>
            <input
              type="checkbox"
              id={`${key}-visible`}
              checked={style.isVisible}
              onChange={(e) => updateTextStyle(key, 'isVisible', e.target.checked)}
              className="h-4 w-4"
            />
          </div>
        </div>

        {style.isVisible && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Position X (%)</Label>
                <Slider
                  value={[style.x]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={([val]) => updateTextStyle(key, 'x', val)}
                />
              </div>
              <div className="space-y-2">
                <Label>Position Y (%)</Label>
                <Slider
                  value={[style.y]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={([val]) => updateTextStyle(key, 'y', val)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Font Size (px)</Label>
                <Input
                  type="number"
                  value={style.fontSize}
                  onChange={(e) => updateTextStyle(key, 'fontSize', Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      style={{ backgroundColor: style.color, color: style.color === '#ffffff' ? '#000' : '#fff' }}
                    >
                      {style.color}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 border-none">
                    <HexColorPicker color={style.color} onChange={(val) => updateTextStyle(key, 'color', val)} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Alignment</Label>
              <div className="flex gap-2">
                {['left', 'center', 'right'].map((align) => (
                  <Button
                    key={align}
                    variant={style.textAlign === align ? "default" : "outline"}
                    size="sm"
                    onClick={() => updateTextStyle(key, 'textAlign', align)}
                    className="capitalize"
                  >
                    {align}
                  </Button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Poster Template Designer</h1>
          <p className="text-muted-foreground">Customize the layout and design for result posters.</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Template
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Controls */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Adjust settings for each element.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="background"><ImageIcon className="mr-2 h-4 w-4" /> Background</TabsTrigger>
                <TabsTrigger value="layout"><Layout className="mr-2 h-4 w-4" /> Layout</TabsTrigger>
                <TabsTrigger value="typography"><Type className="mr-2 h-4 w-4" /> Typography</TabsTrigger>
              </TabsList>

              <TabsContent value="background" className="space-y-4 mt-4">
                <div className="space-y-4">
                  <Label>Background Image</Label>
                  <div className="flex gap-4">
                    <Input
                      value={settings.backgroundImageUrl}
                      onChange={(e) => setSettings(prev => ({ ...prev, backgroundImageUrl: e.target.value }))}
                      placeholder="https://..."
                    />
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    </Button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageUpload}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Upload an image to ImgBB or paste a direct URL.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="layout" className="space-y-4 mt-4 h-[600px] overflow-y-auto pr-2">
                {renderControlGroup('Program Name', 'programName')}
                {renderControlGroup('Category Name', 'categoryName')}
                {renderControlGroup('Winner 1 (Gold)', 'winner1')}
                {renderControlGroup('Winner 2 (Silver)', 'winner2')}
                {renderControlGroup('Winner 3 (Bronze)', 'winner3')}
              </TabsContent>

              <TabsContent value="typography" className="space-y-4 mt-4">
                <div className="p-4 border rounded-lg bg-muted/50 text-center">
                  <p className="text-muted-foreground">
                    Typography settings are currently integrated into the Layout tab for easier positioning and styling together.
                  </p>
                  <Button variant="link" onClick={() => setActiveTab('layout')}>Go to Layout</Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Preview */}
        <div className="sticky top-8">
          <Card className="overflow-hidden bg-zinc-950 border-zinc-800">
            <CardHeader className="border-b border-zinc-800 bg-zinc-900/50">
              <CardTitle className="text-zinc-100">Live Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex justify-center bg-zinc-900/20 min-h-[600px] items-center">
              <div
                className="relative bg-white shadow-2xl overflow-hidden"
                style={{
                  width: '400px',
                  height: '600px',
                  backgroundImage: settings.backgroundImageUrl ? `url(${settings.backgroundImageUrl})` : 'none',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundColor: settings.backgroundImageUrl ? 'transparent' : '#1a1a1a'
                }}
              >
                {!settings.backgroundImageUrl && (
                  <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
                    No Background Image
                  </div>
                )}

                {/* Elements */}
                {[
                  { key: 'programName', text: 'Dram Art' },
                  { key: 'categoryName', text: 'General Category' },
                  { key: 'winner1', text: '1. John Doe (Team A)' },
                  { key: 'winner2', text: '2. Jane Smith (Team B)' },
                  { key: 'winner3', text: '3. Bob Johnson (Team C)' },
                ].map(({ key, text }) => {
                  const style = settings[key as keyof PosterSettings] as TextStyle;
                  if (!style.isVisible) return null;
                  return (
                    <div
                      key={key}
                      style={{
                        position: 'absolute',
                        left: `${style.x}%`,
                        top: `${style.y}%`,
                        transform: 'translate(-50%, -50%)',
                        fontSize: `${style.fontSize}px`,
                        color: style.color,
                        fontWeight: style.fontWeight,
                        textAlign: style.textAlign,
                        whiteSpace: 'nowrap',
                        width: '100%',
                        // textShadow: '0 2px 4px rgba(0,0,0,0.5)'
                      }}
                    >
                      {text}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
