'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from '@/lib/supabase';
import { doc, getFirestore, setDoc, getDoc } from 'firebase/firestore';
import { app } from '@/lib/firebase';
import { Loader2, Upload, Image as ImageIcon, Save, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const db = getFirestore(app);

export default function PosterTemplatePage() {
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bgUrl, setBgUrl] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string>('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'poster');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.backgroundUrl) {
            setBgUrl(data.backgroundUrl);
            setPreviewUrl(data.backgroundUrl);
          }
        }
      } catch (error) {
        console.error("Error fetching poster settings:", error);
        toast.error("Failed to load current settings");
      }
    };

    fetchSettings();
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return;
    }

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `poster-bg-${Date.now()}.${fileExt}`;
    const filePath = `poster-templates/${fileName}`;

    setUploading(true);

    try {
      const { data, error } = await supabase.storage
        .from('fest-assets') // Assuming a bucket named 'fest-assets' exists, or user needs to create it
        .upload(filePath, file);

      if (error) {
        throw error;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('fest-assets')
        .getPublicUrl(filePath);

      setPreviewUrl(publicUrl);
      toast.success("Image uploaded successfully!");
    } catch (error: any) {
      console.error('Error uploading image:', error);
      toast.error(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!previewUrl) {
      toast.error("No image to save");
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'poster'), {
        backgroundUrl: previewUrl,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setBgUrl(previewUrl);
      toast.success("Poster template saved successfully!");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Poster Template</h1>
          <p className="text-muted-foreground">Customize the appearance of result posters.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Background Image</CardTitle>
            <CardDescription>
              Upload a custom background image for the result posters.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="picture">Image File</Label>
              <div className="flex gap-2">
                <Input
                  id="picture"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploading}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Recommended size: 1080x1920px (Portrait) or similar high resolution.
              </p>
            </div>

            {uploading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading to Supabase...
              </div>
            )}

            <div className="pt-4">
              <Button onClick={handleSave} disabled={saving || !previewUrl || previewUrl === bgUrl} className="w-full sm:w-auto">
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Configuration
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>
              Current background preview.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center bg-muted/20 p-6 min-h-[400px] items-center">
            {previewUrl ? (
              <div className="relative w-[200px] h-[300px] rounded-lg overflow-hidden shadow-xl border border-border">
                <img
                  src={previewUrl}
                  alt="Poster Background Preview"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <span className="text-white/80 text-xs font-medium px-2 py-1 bg-black/40 rounded backdrop-blur-sm">
                    Poster Content Overlay
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                <ImageIcon className="h-12 w-12 opacity-20" />
                <p>No background selected</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
