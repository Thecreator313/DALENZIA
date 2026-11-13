'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, doc, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAppSettings, useCachedCollection, useCachedDoc } from '@/context/firestore-cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Copy,
  Download,
  Edit3,
  Eye,
  LayoutTemplate,
  Loader2,
  Plus,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  CANVAS_PRESETS,
  clonePosterSettings,
  createPosterTemplateId,
  downloadPosterBlob,
  ensurePosterFontsLoaded,
  normalizePosterCatalog,
  normalizePosterSettings,
  resolvePreviewResult,
  serializePosterCatalogForFirestore,
  type PosterTemplateCatalog,
  type PosterTemplateItem,
} from '@/lib/poster-template';
import {
  ResultPosterCanvas,
  type ResultPosterCanvasHandle,
} from '@/components/result-poster-canvas';
import {
  PosterStudioEditor,
  type PublishedResultPreviewDoc,
} from '@/components/poster-studio-editor';
import { cn } from '@/lib/utils';

export default function PosterTemplatePage() {
  const { settings: appSettings } = useAppSettings();
  const festName = appSettings.festName || 'Fest Central';

  const { data: livePosterSettings, loading } = useCachedDoc<Record<string, unknown>>(
    'doc:settings:posterTemplate',
    () => doc(db, 'settings', 'posterTemplate')
  );
  const { data: publishedResults } = useCachedCollection<PublishedResultPreviewDoc>(
    'query:publishedResults:desc',
    () => query(collection(db, 'publishedResults'), orderBy('resultNumber', 'desc'))
  );

  const [catalog, setCatalog] = useState<PosterTemplateCatalog>(() =>
    normalizePosterCatalog(null)
  );
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editorInitialFocus, setEditorInitialFocus] = useState<'canvas' | 'layer'>('layer');
  const [saving, setSaving] = useState(false);

  // Gallery live preview source
  const [previewKey, setPreviewKey] = useState<string>('sample');
  const [previewModalTplId, setPreviewModalTplId] = useState<string | null>(null);
  const [modalDownloadBusy, setModalDownloadBusy] = useState(false);
  const modalPosterRef = useRef<ResultPosterCanvasHandle>(null);

  // Create template modal state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTplName, setNewTplName] = useState('');
  const [newTplPresetId, setNewTplPresetId] = useState<string>(CANVAS_PRESETS[0].id);
  const [cloneSourceId, setCloneSourceId] = useState<string>('fresh');

  // Delete confirmation modal state
  const [deleteTargetTpl, setDeleteTargetTpl] = useState<PosterTemplateItem | null>(null);

  useEffect(() => {
    ensurePosterFontsLoaded();
  }, []);

  useEffect(() => {
    if (livePosterSettings) {
      setCatalog(normalizePosterCatalog(livePosterSettings));
    }
  }, [livePosterSettings]);

  const galleryPreviewResult = useMemo(
    () => resolvePreviewResult(previewKey, publishedResults),
    [previewKey, publishedResults]
  );

  const editingTemplate = useMemo(
    () => catalog.templates.find((t) => t.id === editingTemplateId) || null,
    [catalog.templates, editingTemplateId]
  );

  const previewModalTemplate = useMemo(
    () => catalog.templates.find((t) => t.id === previewModalTplId) || null,
    [catalog.templates, previewModalTplId]
  );

  const persistCatalog = async (nextCatalog: PosterTemplateCatalog, successTitle?: string) => {
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'settings', 'posterTemplate'),
        serializePosterCatalogForFirestore(nextCatalog)
      );
      setCatalog(nextCatalog);
      if (successTitle) {
        toast({ title: successTitle });
      }
    } catch (error) {
      console.error('Error saving poster catalog:', error);
      toast({
        title: 'Save Failed',
        description: 'Could not update templates in Firestore.',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const openCreateDialog = () => {
    setNewTplName(`Template ${catalog.templates.length + 1}`);
    setNewTplPresetId(CANVAS_PRESETS[0].id);
    setCloneSourceId('fresh');
    setCreateDialogOpen(true);
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newTplName.trim() || `Template ${catalog.templates.length + 1}`;
    const preset =
      CANVAS_PRESETS.find((p) => p.id === newTplPresetId) || CANVAS_PRESETS[0];

    let baseSettings = normalizePosterSettings(null);
    if (cloneSourceId !== 'fresh') {
      const source = catalog.templates.find((t) => t.id === cloneSourceId);
      if (source) {
        baseSettings = clonePosterSettings(source.settings);
      }
    } else {
      baseSettings = {
        ...baseSettings,
        canvasWidth: preset.width,
        canvasHeight: preset.height,
      };
    }

    const newItem: PosterTemplateItem = {
      id: createPosterTemplateId(),
      name: trimmedName,
      isActive: true,
      settings: baseSettings,
    };

    const nextCatalog: PosterTemplateCatalog = {
      ...catalog,
      templates: [...catalog.templates, newItem],
    };

    await persistCatalog(nextCatalog, `Created "${trimmedName}"`);
    setCreateDialogOpen(false);
    setEditorInitialFocus('canvas');
    setEditingTemplateId(newItem.id);
  };

  const handleDuplicateTemplate = async (tpl: PosterTemplateItem) => {
    const newItem: PosterTemplateItem = {
      id: createPosterTemplateId(),
      name: `${tpl.name} Copy`,
      isActive: tpl.isActive,
      settings: clonePosterSettings(tpl.settings),
    };
    const nextCatalog: PosterTemplateCatalog = {
      ...catalog,
      templates: [...catalog.templates, newItem],
    };
    await persistCatalog(nextCatalog, `Duplicated "${tpl.name}"`);
  };

  const handleSetDefault = async (tpl: PosterTemplateItem) => {
    const nextCatalog: PosterTemplateCatalog = {
      ...catalog,
      defaultTemplateId: tpl.id,
    };
    await persistCatalog(nextCatalog, `"${tpl.name}" set as default template`);
  };

  const handleToggleActive = async (tpl: PosterTemplateItem) => {
    const nextCatalog: PosterTemplateCatalog = {
      ...catalog,
      templates: catalog.templates.map((item) =>
        item.id === tpl.id ? { ...item, isActive: !item.isActive } : item
      ),
    };
    await persistCatalog(
      nextCatalog,
      !tpl.isActive
        ? `"${tpl.name}" is now visible on result pages`
        : `"${tpl.name}" hidden from public result pages`
    );
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetTpl || catalog.templates.length <= 1) return;
    const remaining = catalog.templates.filter((t) => t.id !== deleteTargetTpl.id);
    const nextDefaultId =
      catalog.defaultTemplateId === deleteTargetTpl.id
        ? remaining[0].id
        : catalog.defaultTemplateId;
    const nextCatalog: PosterTemplateCatalog = {
      defaultTemplateId: nextDefaultId,
      templates: remaining,
    };
    const deletedName = deleteTargetTpl.name;
    setDeleteTargetTpl(null);
    await persistCatalog(nextCatalog, `Deleted "${deletedName}"`);
  };

  const handleModalDownload = async () => {
    if (!modalPosterRef.current || !previewModalTemplate) return;
    setModalDownloadBusy(true);
    try {
      const blob = await modalPosterRef.current.exportPngBlob();
      const slug = previewModalTemplate.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'poster';
      downloadPosterBlob(
        blob,
        `${slug}-${previewModalTemplate.settings.canvasWidth}x${previewModalTemplate.settings.canvasHeight}.png`
      );
      toast({
        title: 'Preview Exported',
        description: `Downloaded ${previewModalTemplate.settings.canvasWidth}×${previewModalTemplate.settings.canvasHeight}px PNG.`,
      });
    } catch (error) {
      console.error('Modal poster export failed:', error);
      toast({
        title: 'Export Failed',
        description: 'Could not export PNG. Re-upload image via Upload button if external URL blocks CORS.',
        variant: 'destructive',
      });
    } finally {
      setModalDownloadBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center gap-3">
        <Loader2 className="h-9 w-9 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading Poster Templates...</p>
      </div>
    );
  }

  // Dedicated Full-Screen Photo Editor View when a template is opened
  if (editingTemplate) {
    return (
      <PosterStudioEditor
        template={editingTemplate}
        isDefault={catalog.defaultTemplateId === editingTemplate.id}
        publishedResults={publishedResults}
        festName={festName}
        saving={saving}
        initialFocus={editorInitialFocus}
        onSaveTemplate={async (updated) => {
          const nextCatalog: PosterTemplateCatalog = {
            ...catalog,
            templates: catalog.templates.map((t) => (t.id === updated.id ? updated : t)),
          };
          await persistCatalog(nextCatalog, `Saved "${updated.name}"`);
        }}
        onBack={() => setEditingTemplateId(null)}
      />
    );
  }

  // Main Templates Library Gallery View
  return (
    <div className="space-y-6 pb-10">
      {/* Main Library Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/85 p-5 shadow-sm backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-headline text-2xl font-bold tracking-tight sm:text-3xl">
              Poster Templates
            </h1>
            <Badge variant="secondary" className="rounded-full font-mono text-xs">
              {catalog.templates.length}{' '}
              {catalog.templates.length === 1 ? 'Template' : 'Templates'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Create &amp; manage multiple result poster styles. Users can switch between active
            templates on every published result page before downloading or sharing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Select value={previewKey} onValueChange={setPreviewKey}>
            <SelectTrigger className="h-10 w-[220px] rounded-xl bg-background/80 text-xs sm:text-sm">
              <SelectValue placeholder="Preview data" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sample">Sample: Single Winners</SelectItem>
              <SelectItem value="sample-ties">Sample: Tied Ranks (2× Each)</SelectItem>
              {publishedResults.slice(0, 20).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  #{r.resultNumber} • {r.programName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={openCreateDialog} className="h-10 rounded-xl shadow-md">
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Button>
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {catalog.templates.map((tpl) => {
          const isDefault = tpl.id === catalog.defaultTemplateId;
          const aspectHint =
            CANVAS_PRESETS.find(
              (p) => p.width === tpl.settings.canvasWidth && p.height === tpl.settings.canvasHeight
            )?.shortLabel || `${tpl.settings.canvasWidth}×${tpl.settings.canvasHeight}`;

          return (
            <Card
              key={tpl.id}
              className={cn(
                'group flex flex-col overflow-hidden border-border/70 bg-card/85 shadow-sm transition-all hover:border-primary/40 hover:shadow-lg',
                !tpl.isActive && 'opacity-80'
              )}
            >
              {/* Live Mini Poster Thumbnail */}
              <div
                onClick={() => setPreviewModalTplId(tpl.id)}
                className="relative flex h-72 cursor-pointer items-center justify-center overflow-hidden border-b border-border/50 bg-zinc-950 p-4"
              >
                <div
                  className={cn(
                    'overflow-hidden rounded-lg shadow-2xl transition-transform duration-300 group-hover:scale-[1.02]',
                    tpl.settings.canvasHeight / tpl.settings.canvasWidth > 1.5
                      ? 'w-[140px]'
                      : tpl.settings.canvasHeight >= tpl.settings.canvasWidth
                      ? 'w-[180px]'
                      : 'w-[240px]'
                  )}
                >
                  <ResultPosterCanvas
                    settings={tpl.settings}
                    result={galleryPreviewResult}
                    festName={festName}
                    thumbnailOnly
                  />
                </div>

                {/* Top Floating Badges */}
                <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                  {isDefault && (
                    <Badge className="gap-1 bg-amber-500 text-zinc-950 hover:bg-amber-500">
                      <Star className="h-3 w-3 fill-current" />
                      Default
                    </Badge>
                  )}
                  <Badge
                    variant="secondary"
                    className="bg-black/70 text-[11px] text-white backdrop-blur-md"
                  >
                    {tpl.isActive ? 'Public' : 'Hidden'}
                  </Badge>
                </div>

                <div className="absolute right-3 bottom-3 rounded-full bg-black/75 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100">
                  Click to Preview
                </div>
              </div>

              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate font-headline text-base">{tpl.name}</CardTitle>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="font-mono">
                        {tpl.settings.canvasWidth}×{tpl.settings.canvasHeight}
                      </span>
                      <span>•</span>
                      <span>{aspectHint}</span>
                      <span>•</span>
                      <span>{tpl.settings.winnerSlots.length} Winner Slots</span>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-1 pb-3">
                <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/25 px-3 py-1.5">
                  <span className="text-xs text-muted-foreground">Visible to Public</span>
                  <Switch
                    checked={tpl.isActive}
                    disabled={saving}
                    onCheckedChange={() => handleToggleActive(tpl)}
                  />
                </div>
              </CardContent>

              <CardFooter className="mt-auto flex flex-wrap items-center justify-between gap-1.5 border-t border-border/50 bg-muted/15 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditorInitialFocus('layer');
                      setEditingTemplateId(tpl.id);
                    }}
                    className="h-8 rounded-lg px-3 text-xs"
                  >
                    <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewModalTplId(tpl.id)}
                    className="h-8 rounded-lg px-2.5 text-xs"
                    title="Full Preview"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="flex items-center gap-1">
                  {!isDefault && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={saving}
                      onClick={() => handleSetDefault(tpl)}
                      className="h-8 w-8 rounded-lg text-amber-500 hover:bg-amber-500/10 hover:text-amber-600"
                      title="Set as Default Template"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={saving}
                    onClick={() => handleDuplicateTemplate(tpl)}
                    className="h-8 w-8 rounded-lg"
                    title="Duplicate Template"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  {catalog.templates.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={saving}
                      onClick={() => setDeleteTargetTpl(tpl)}
                      className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                      title="Delete Template"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>
          );
        })}

        {/* Quick "+ Create Template" Card at end of Grid */}
        <button
          type="button"
          onClick={openCreateDialog}
          className="flex min-h-[380px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border/70 bg-muted/15 p-6 text-center transition-all hover:border-primary/60 hover:bg-primary/5"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Plus className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <div className="font-headline text-base font-semibold">Create New Template</div>
            <div className="max-w-[200px] text-xs text-muted-foreground">
              Add another poster design with its own fonts, colors, positions &amp; size.
            </div>
          </div>
        </button>
      </div>

      {/* Create New Template Dialog (Set Name & Canvas -> Opens Dedicated Studio Editor) */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleCreateTemplate}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-headline">
                <LayoutTemplate className="h-5 w-5 text-primary" />
                New Poster Template
              </DialogTitle>
              <DialogDescription>
                Give your poster style a name and choose a starting canvas, then open the editor to
                upload your background and style each variable.
              </DialogDescription>
            </DialogHeader>

            <div className="my-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-tpl-name">Template Name</Label>
                <Input
                  id="new-tpl-name"
                  value={newTplName}
                  onChange={(e) => setNewTplName(e.target.value)}
                  placeholder="e.g. Classic Gold Portrait, Minimal Dark, WhatsApp Status"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Starting Base</Label>
                <Select value={cloneSourceId} onValueChange={setCloneSourceId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fresh">Start Fresh Blank Template</SelectItem>
                    {catalog.templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        Clone from &quot;{t.name}&quot; ({t.settings.canvasWidth}×
                        {t.settings.canvasHeight})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {cloneSourceId === 'fresh' && (
                <div className="space-y-2">
                  <Label>Canvas Size Preset</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {CANVAS_PRESETS.map((preset) => {
                      const active = newTplPresetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setNewTplPresetId(preset.id)}
                          className={cn(
                            'flex items-center justify-between rounded-xl border px-3 py-2 text-left transition-all',
                            active
                              ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/25'
                              : 'border-border/60 bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                          )}
                        >
                          <div>
                            <div className="text-xs font-semibold">{preset.shortLabel}</div>
                            <div className="font-mono text-[10px] opacity-80">
                              {preset.width}×{preset.height}
                            </div>
                          </div>
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                            {preset.aspect}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Create &amp; Open Editor
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Large Template Preview Lightbox Dialog */}
      <Dialog
        open={!!previewModalTemplate}
        onOpenChange={(open) => {
          if (!open) setPreviewModalTplId(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          {previewModalTemplate && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
                  <div>
                    <DialogTitle className="font-headline">{previewModalTemplate.name}</DialogTitle>
                    <DialogDescription>
                      {previewModalTemplate.settings.canvasWidth}×
                      {previewModalTemplate.settings.canvasHeight}px •{' '}
                      {previewModalTemplate.settings.winnerSlots.length} Winner Slots
                    </DialogDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={previewKey} onValueChange={setPreviewKey}>
                      <SelectTrigger className="h-8 w-[195px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sample">Sample: Single Winners</SelectItem>
                        <SelectItem value="sample-ties">Sample: Tied Ranks (2× Each)</SelectItem>
                        {publishedResults.slice(0, 20).map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            #{r.resultNumber} • {r.programName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex justify-center overflow-hidden rounded-xl border bg-zinc-950 p-4">
                  <ResultPosterCanvas
                    ref={modalPosterRef}
                    settings={previewModalTemplate.settings}
                    result={galleryPreviewResult}
                    festName={festName}
                    className={
                      previewModalTemplate.settings.canvasHeight >
                      previewModalTemplate.settings.canvasWidth
                        ? 'w-full max-w-[440px]'
                        : 'w-full max-w-[680px]'
                    }
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    onClick={handleModalDownload}
                    disabled={modalDownloadBusy}
                  >
                    {modalDownloadBusy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Download Test PNG
                  </Button>
                  <Button
                    onClick={() => {
                      const targetId = previewModalTemplate.id;
                      setPreviewModalTplId(null);
                      setEditorInitialFocus('layer');
                      setEditingTemplateId(targetId);
                    }}
                  >
                    <Edit3 className="mr-2 h-4 w-4" />
                    Edit This Template
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Template Confirmation Dialog */}
      <AlertDialog
        open={!!deleteTargetTpl}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetTpl(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{deleteTargetTpl?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the poster template from your studio and from public result pages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
