
'use client';

import { useState, useEffect } from 'react';
import { doc, getFirestore, onSnapshot } from 'firebase/firestore';
import { app } from '@/lib/firebase';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from '@/components/theme-provider';
import type { AppSettings } from '@/app/admin/settings/page';

const db = getFirestore(app);

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [festName, setFestName] = useState('Fest Central');

  useEffect(() => {
    const settingsDocRef = doc(db, 'settings', 'global');
    const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const settings = docSnap.data() as AppSettings;
        if (settings.festName) {
          setFestName(settings.festName);
          document.title = settings.festName;
        }
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>{festName}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Code+Pro:wght@400;500&display=swap" rel="stylesheet"></link>
      </head>
      <body className="font-body bg-background antialiased">
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
            {children}
            <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
