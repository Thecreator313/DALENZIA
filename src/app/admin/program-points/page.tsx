
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { app } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';
import type { Program } from '@/app/admin/programs/page';

const db = getFirestore(app);

const gradeSchema = z.object({
  'A+': z.coerce.number().min(0, 'Must be 0 or more'),
  A: z.coerce.number().min(0, 'Must be 0 or more'),
  B: z.coerce.number().min(0, 'Must be 0 or more'),
  C: z.coerce.number().min(0, 'Must be 0 or more'),
});

const specialProgramSchema = z.object({
    programId: z.string(),
    programName: z.string(),
    grades: gradeSchema,
});

const formSchema = z.object({
  normalGradePoints: gradeSchema,
  specialPrograms: z.array(specialProgramSchema),
  rankPoints: z.object({
    first: z.coerce.number().min(0, 'Must be 0 or more'),
    second: z.coerce.number().min(0, 'Must be 0 or more'),
    third: z.coerce.number().min(0, 'Must be 0 or more'),
  }),
});

type FormData = z.infer<typeof formSchema>;
type PointsData = Omit<FormData, 'specialPrograms'> & { specialGradePoints: Record<string, z.infer<typeof gradeSchema>> };


export default function ProgramPointsPage() {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [allPrograms, setAllPrograms] = useState<Program[] | null>(null);
  const [pointsData, setPointsData] = useState<PointsData | null | undefined>(undefined);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      normalGradePoints: { 'A+': 0, A: 0, B: 0, C: 0 },
      specialPrograms: [],
      rankPoints: { first: 0, second: 0, third: 0 },
    },
  });

  const { fields: specialProgramFields } = useFieldArray({
    control: form.control,
    name: 'specialPrograms',
  });

  useEffect(() => {
    const programsUnsubscribe = onSnapshot(collection(db, 'programs'), (snapshot) => {
        const programsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Program));
        setAllPrograms(programsData);
    });

    const pointsDocRef = doc(db, 'points', 'gradeAndRankPoints');
    const pointsUnsubscribe = onSnapshot(pointsDocRef, (docSnap) => {
        if (docSnap.exists()) {
            setPointsData(docSnap.data() as PointsData);
        } else {
            setPointsData(null); 
        }
    });

    return () => {
      programsUnsubscribe();
      pointsUnsubscribe();
    };
  }, []);

  useEffect(() => {
      if (allPrograms !== null && pointsData !== undefined) {
        const specialMarkPrograms = allPrograms.filter(p => p.markType === 'special-mark');
        
        const specialProgramValues = specialMarkPrograms.map(p => {
            const existingData = pointsData?.specialGradePoints?.[p.id];
            return {
                programId: p.id,
                programName: p.name,
                grades: existingData || { 'A+': 0, A: 0, B: 0, C: 0 }
            };
        });

        form.reset({
            normalGradePoints: pointsData?.normalGradePoints || { 'A+': 0, A: 0, B: 0, C: 0 },
            rankPoints: pointsData?.rankPoints || { first: 0, second: 0, third: 0 },
            specialPrograms: specialProgramValues
        });
        setLoading(false);
      }
  }, [allPrograms, pointsData, form]);


  const onSubmit = async (data: FormData) => {
    setIsSaving(true);
    try {
      const { normalGradePoints, rankPoints, specialPrograms } = data;
      const specialGradePoints = specialPrograms.reduce((acc, sp) => {
        acc[sp.programId] = sp.grades;
        return acc;
      }, {} as Record<string, any>);

      const finalPointsData: PointsData = { normalGradePoints, rankPoints, specialGradePoints };
      
      await setDoc(doc(db, 'points', 'gradeAndRankPoints'), finalPointsData, { merge: true });

      toast({
        title: 'Success!',
        description: 'Point settings have been saved successfully.',
      });
    } catch (error) {
      console.error('Error saving points:', error);
      toast({
        title: 'Error',
        description: 'Failed to save point settings.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="mr-2 h-8 w-8 animate-spin" />
        <span>Loading Point Settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-headline">Program Points</h1>
        <Button onClick={form.handleSubmit(onSubmit)} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </div>
      
      <form>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Grade-based Points</CardTitle>
              <CardDescription>
                Assign points for each grade. These points are awarded to participants.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="mb-2 text-lg font-semibold">Normal Programs</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Program Type</TableHead>
                      <TableHead>A+</TableHead>
                      <TableHead>A</TableHead>
                      <TableHead>B</TableHead>
                      <TableHead>C</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Normal</TableCell>
                      <TableCell><Controller name="normalGradePoints.A+" control={form.control} render={({ field }) => <Input type="number" {...field} /> } /></TableCell>
                      <TableCell><Controller name="normalGradePoints.A" control={form.control} render={({ field }) => <Input type="number" {...field} /> } /></TableCell>
                      <TableCell><Controller name="normalGradePoints.B" control={form.control} render={({ field }) => <Input type="number" {...field} /> } /></TableCell>
                      <TableCell><Controller name="normalGradePoints.C" control={form.control} render={({ field }) => <Input type="number" {...field} /> } /></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div>
                <h3 className="mb-2 text-lg font-semibold">Special Mark Programs</h3>
                 <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Program Name</TableHead>
                      <TableHead>A+</TableHead>
                      <TableHead>A</TableHead>
                      <TableHead>B</TableHead>
                      <TableHead>C</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {specialProgramFields.map((field, index) => (
                      <TableRow key={field.id}>
                        <TableCell className="font-medium">{field.programName}</TableCell>
                        <TableCell><Controller name={`specialPrograms.${index}.grades.A+`} control={form.control} render={({ field }) => <Input type="number" {...field} /> } /></TableCell>
                        <TableCell><Controller name={`specialPrograms.${index}.grades.A`} control={form.control} render={({ field }) => <Input type="number" {...field} /> } /></TableCell>
                        <TableCell><Controller name={`specialPrograms.${index}.grades.B`} control={form.control} render={({ field }) => <Input type="number" {...field} /> } /></TableCell>
                        <TableCell><Controller name={`specialPrograms.${index}.grades.C`} control={form.control} render={({ field }) => <Input type="number" {...field} /> } /></TableCell>
                      </TableRow>
                    ))}
                    {specialProgramFields.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                No programs are marked as 'Special Mark'.
                            </TableCell>
                        </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rank-based Points</CardTitle>
              <CardDescription>
                Assign points for top ranks in individual programs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Point</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">First</TableCell>
                    <TableCell><Controller name="rankPoints.first" control={form.control} render={({ field }) => <Input type="number" {...field} /> } /></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Second</TableCell>
                    <TableCell><Controller name="rankPoints.second" control={form.control} render={({ field }) => <Input type="number" {...field} /> } /></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Third</TableCell>
                    <TableCell><Controller name="rankPoints.third" control={form.control} render={({ field }) => <Input type="number" {...field} /> } /></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
