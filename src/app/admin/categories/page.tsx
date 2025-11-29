
'use client';

import { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
} from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { app } from '@/lib/firebase';
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { toast } from '@/hooks/use-toast';
import { MoreHorizontal, PlusCircle, Trash, Edit } from 'lucide-react';
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
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';


const db = getFirestore(app);

const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  isGeneral: z.boolean().optional().default(false),
});

export type Category = z.infer<typeof categorySchema> & { id: string };

type CategoryType = 'programCategories' | 'memberCategories';


const CategoryManager = ({ categoryType }: { categoryType: CategoryType }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  const typeLabel = categoryType === 'programCategories' ? 'Program Category' : 'Member Category';

  useEffect(() => {
    setLoading(true);
    const catCollection = collection(db, categoryType);
    const unsubscribe = onSnapshot(
      catCollection,
      (snapshot) => {
        const catList = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Category)
        );
        setCategories(catList);
        setLoading(false);
      },
      (error) => {
        console.error(`Error fetching ${typeLabel}s:`, error);
        toast({
          title: 'Error',
          description: `Failed to fetch ${typeLabel.toLowerCase()}s.`,
          variant: 'destructive',
        });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [categoryType, typeLabel]);
  
  const form = useForm<z.infer<typeof categorySchema>>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', isGeneral: false },
  });

  const onSubmit = async (values: z.infer<typeof categorySchema>) => {
    try {
      if (editingCategory) {
        const categoryDoc = doc(db, categoryType, editingCategory.id);
        await updateDoc(categoryDoc, values);
        toast({ title: 'Success', description: `${typeLabel} updated successfully.` });
      } else {
        await addDoc(collection(db, categoryType), values);
        toast({ title: 'Success', description: `${typeLabel} added successfully.` });
      }
      form.reset();
      setEditingCategory(null);
      setIsFormOpen(false);
    } catch (error) {
      console.error(`Error saving ${typeLabel}:`, error);
      toast({
        title: 'Error',
        description: `Failed to save ${typeLabel.toLowerCase()}.`,
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    form.reset(category);
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (!categoryToDelete) return;
    try {
      await deleteDoc(doc(db, categoryType, categoryToDelete.id));
      toast({ title: 'Success', description: `${typeLabel} deleted successfully.` });
      setCategoryToDelete(null);
      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error(`Error deleting ${typeLabel}:`, error);
      toast({
        title: 'Error',
        description: `Failed to delete ${typeLabel.toLowerCase()}.`,
        variant: 'destructive',
      });
    }
  };
  
  const openDeleteDialog = (category: Category) => {
    setCategoryToDelete(category);
    setIsDeleteDialogOpen(true);
  };

  const openAddForm = () => {
    setEditingCategory(null);
    form.reset({ name: '', isGeneral: false });
    setIsFormOpen(true);
  };

  if (loading) return <div>Loading...</div>;

  return (
     <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{typeLabel} List</CardTitle>
           <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button onClick={openAddForm}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add {typeLabel}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingCategory ? `Edit ${typeLabel}` : `Add ${typeLabel}`}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Dance" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {categoryType === 'programCategories' && (
                    <FormField
                      control={form.control}
                      name="isGeneral"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>
                              Mark as General
                            </FormLabel>
                             <p className="text-sm text-muted-foreground">
                                If checked, all students are eligible for programs in this category, regardless of their own category.
                            </p>
                          </div>
                        </FormItem>
                      )}
                    />
                  )}
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="outline">
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button type="submit">
                      {editingCategory ? 'Save Changes' : 'Create Category'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                {categoryType === 'programCategories' && <TableHead>Type</TableHead>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell>{category.name}</TableCell>
                   {categoryType === 'programCategories' && <TableCell>{category.isGeneral ? "General" : "Specific"}</TableCell>}
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(category)}>
                          <Edit className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openDeleteDialog(category)}
                          className="text-destructive"
                        >
                          <Trash className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
         <AlertDialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the
                  category.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
      </Card>
  )

}


export default function CategoriesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
         <h1 className="text-3xl font-bold font-headline">Manage Categories</h1>
      </div>

      <Tabs defaultValue="program">
        <TabsList>
          <TabsTrigger value="program">Program Categories</TabsTrigger>
          <TabsTrigger value="member">Member Categories</TabsTrigger>
        </TabsList>
        <TabsContent value="program" className="mt-4">
          <CategoryManager categoryType="programCategories" />
        </TabsContent>
        <TabsContent value="member" className="mt-4">
          <CategoryManager categoryType="memberCategories" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
