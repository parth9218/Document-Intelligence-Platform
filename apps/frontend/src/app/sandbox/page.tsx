'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useToast } from '@/components/ui/toast';
import { Sun, Moon, Sparkles, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { notFound } from 'next/navigation';

export default function SandboxPage() {
  // Lock sandbox access to development environments only (404 in production)
  if (process.env.NEXT_ENV === 'production') {
    notFound();
  }

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [progressVal, setProgressVal] = useState<number>(45);
  const { toast } = useToast();

  // Apply theme to HTML node for styling updates
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300 p-8 flex flex-col items-center">
      {/* Sandbox Header */}
      <header className="max-w-6xl w-full flex flex-col sm:flex-row justify-between items-center mb-12 p-6 glass-panel rounded-2xl">
        <div className="flex items-center space-x-3 mb-4 sm:mb-0">
          <Sparkles className="h-6 w-6 text-accent animate-pulse" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">UI Component Sandbox</h1>
            <p className="text-xs text-muted">Test liquid-glass components, theme changes, and toasts</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">
            Current Theme: {theme}
          </span>
          <Button variant="glass" size="sm" onClick={toggleTheme} className="flex items-center space-x-2">
            {theme === 'dark' ? (
              <>
                <Sun className="h-4 w-4 text-amber-400" />
                <span>Switch to Light</span>
              </>
            ) : (
              <>
                <Moon className="h-4 w-4 text-indigo-400" />
                <span>Switch to Dark</span>
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Main Components Grid */}
      <main className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
        
        {/* Buttons Test Suite */}
        <section className="flex flex-col space-y-6">
          <h2 className="text-lg font-bold border-b border-white/5 pb-2 text-foreground flex items-center space-x-2">
            <span>1. Reusable Buttons</span>
          </h2>
          <Card>
            <CardHeader>
              <CardTitle>Button Variants</CardTitle>
              <CardDescription>Visual design options for triggers and controls</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <Button variant="primary">Primary Accent</Button>
              <Button variant="secondary">Secondary HSL</Button>
              <Button variant="glass">Glass Panel</Button>
              <Button variant="danger">Danger Outline</Button>
              <Button variant="ghost">Ghost Trigger</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Button Sizes & States</CardTitle>
              <CardDescription>Scale sizing configurations and system states</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <Button size="sm" variant="glass">Small Button</Button>
                <Button size="md" variant="glass">Medium (Default)</Button>
                <Button size="lg" variant="glass">Large Layout</Button>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <Button variant="primary" isLoading>Processing</Button>
                <Button variant="secondary" disabled>Disabled State</Button>
                <Button variant="glass" isLoading>Loading Glass</Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Cards & Layout Panels */}
        <section className="flex flex-col space-y-6">
          <h2 className="text-lg font-bold border-b border-white/5 pb-2 text-foreground flex items-center space-x-2">
            <span>2. Container Panels</span>
          </h2>
          
          <Card interactive>
            <CardHeader>
              <CardTitle>Interactive Glass Card</CardTitle>
              <CardDescription>Hover over this card to view floating and glow transformations</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted leading-relaxed">
                This panel implements class configurations `.glass-panel-interactive` mapping translucency, hardware-accelerated backdrops (`backdrop-blur-md`), and neon border reflections.
              </p>
            </CardContent>
            <CardFooter>
              <span className="text-xs text-accent font-semibold tracking-wide uppercase">Hover Active</span>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Static Information Container</CardTitle>
              <CardDescription>Fixed styling rules for dashboard grids</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted leading-relaxed">
                A static card that maintains depth without reactive hover offsets. Ideal for lists, status logs, and inventory counts.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Progress & Upload Simulation */}
        <section className="flex flex-col space-y-6 md:col-span-2">
          <h2 className="text-lg font-bold border-b border-white/5 pb-2 text-foreground">
            3. Dynamic Progress Bars
          </h2>
          
          <Card>
            <CardHeader>
              <CardTitle>Ingestion & Processing Stages</CardTitle>
              <CardDescription>Custom colors reflecting active backend operations</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col space-y-6">
              {/* Slider Controller */}
              <div className="flex flex-col space-y-2 p-4 bg-white/5 rounded-xl border border-white/5">
                <label className="text-xs font-semibold text-muted flex justify-between">
                  <span>Simulate Progress Level</span>
                  <span className="text-accent">{progressVal}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={progressVal}
                  onChange={(e) => setProgressVal(Number(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-lg cursor-pointer accent-primary"
                />
              </div>

              {/* Progress bars list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <ProgressBar value={progressVal} status="uploading" showLabel />
                <ProgressBar value={progressVal} status="processing" showLabel />
                <ProgressBar value={progressVal} status="success" showLabel />
                <ProgressBar value={progressVal} status="failed" showLabel />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Toast Triggers */}
        <section className="flex flex-col space-y-6 md:col-span-2">
          <h2 className="text-lg font-bold border-b border-white/5 pb-2 text-foreground">
            4. Toast Alerts System
          </h2>
          
          <Card>
            <CardHeader>
              <CardTitle>Notification Center</CardTitle>
              <CardDescription>Trigger asynchronous popups targeting system notifications</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <Button
                variant="glass"
                className="flex items-center space-x-2 border-emerald-500/20 hover:border-emerald-500/40"
                onClick={() => toast({
                  type: 'success',
                  title: 'Ingestion Completed',
                  message: 'Successfully processed invoice.pdf. Created 12 document chunks.',
                })}
              >
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                <span>Trigger Success Toast</span>
              </Button>

              <Button
                variant="glass"
                className="flex items-center space-x-2 border-red-500/20 hover:border-red-500/40"
                onClick={() => toast({
                  type: 'error',
                  title: 'Upload Rejected',
                  message: 'Batch upload failed. Session storage quota (50MB) exceeded.',
                })}
              >
                <AlertCircle className="h-4 w-4 text-red-400" />
                <span>Trigger Error Toast</span>
              </Button>

              <Button
                variant="glass"
                className="flex items-center space-x-2 border-amber-500/20 hover:border-amber-500/40"
                onClick={() => toast({
                  type: 'warning',
                  title: 'Limits Exceeded',
                  message: 'Document selection capped at maximum 5 concurrent files.',
                })}
              >
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span>Trigger Warning Toast</span>
              </Button>

              <Button
                variant="glass"
                className="flex items-center space-x-2 border-primary/20 hover:border-primary/40"
                onClick={() => toast({
                  type: 'info',
                  title: 'Session Established',
                  message: 'Signed security cookie token registered with 24h sliding expiry.',
                })}
              >
                <Info className="h-4 w-4 text-primary" />
                <span>Trigger Info Toast</span>
              </Button>
            </CardContent>
          </Card>
        </section>

      </main>
    </div>
  );
}
