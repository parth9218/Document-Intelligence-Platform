import type { Metadata } from 'next';
import { Outfit, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import { AppShell } from '@/components/layout/app-shell';
import './globals.css';

const outfit = Outfit({
  variable: '--font-sans',
  subsets: ['latin'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Document Intelligence Platform',
  description: 'Enterprise multi-tenant microservices Retrieval-Augmented Generation (RAG) tool.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark" // Sleek dark mode by default
      className={`${outfit.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground flex flex-col font-sans">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
