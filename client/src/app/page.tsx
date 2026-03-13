'use client';

import { useEffect, useState } from 'react';
import { FileText, CalendarRange, PenLine, CheckCircle2, ArrowRight, Sparkles, Link2, Wand2, Activity } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import Link from 'next/link';

interface Stats {
  totalArticles: number;
  totalPlanned: number;
  totalPublished: number;
  totalDraft: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ totalArticles: 0, totalPlanned: 0, totalPublished: 0, totalDraft: 0 });

  useEffect(() => {
    fetch(apiUrl('/api/stats')).then(r => r.json()).then(setStats);
  }, []);

  const steps = [
    { icon: Link2, title: 'Вставте посилання', desc: 'Додайте URL сайту' },
    { icon: FileText, title: 'Оберіть статті', desc: 'Додайте до плану' },
    { icon: Wand2, title: 'Згенеруйте пост', desc: 'AI створить текст' },
    { icon: CheckCircle2, title: 'Опублікуйте', desc: 'Пост в LinkedIn' },
  ];

  return (
    <div className="space-y-6">
      {/* Header slightly more compact now */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Дашборд</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Керування контентом та стратегією</p>
        </div>
      </div>

      {/* Main Grid Structure */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

        {/* Hero Quick Action (spans 8 cols) */}
        <Link
          href="/ideas"
          className="md:col-span-8 group relative rounded-[1.5rem] bg-card border border-border/50 overflow-hidden transition-all duration-300 hover:border-border hover:shadow-xl hover:shadow-black/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-cyan-500/5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none group-hover:bg-primary/10 transition-colors duration-500" />

          <div className="relative p-8 h-full flex flex-col justify-between">
            <div className="flex items-center gap-4 mb-12">
              <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-black/30 text-primary-foreground transition-transform duration-500 group-hover:scale-105">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="font-medium text-muted-foreground text-sm tracking-wide uppercase">Швидка дія</div>
            </div>

            <div>
              <h2 className="text-3xl font-semibold mb-2 group-hover:text-primary transition-colors">Зібрати новий контент</h2>
              <p className="text-muted-foreground text-lg max-w-md">
                Вставте посилання на сайт та миттєво витягніть статті для вашого контент плану.
              </p>
            </div>

            <div className="absolute bottom-8 right-8">
              <div className="w-12 h-12 rounded-full border border-border/80 bg-background flex items-center justify-center text-muted-foreground group-hover:bg-blue-500 group-hover:text-white group-hover:border-blue-500 transition-all duration-300">
                <ArrowRight className="w-5 h-5 group-hover:-rotate-45 transition-transform duration-300" />
              </div>
            </div>
          </div>
        </Link>

        {/* Primary Stat: Drafts (spans 4 cols) */}
        <div className="md:col-span-4 rounded-[1.5rem] bg-card border border-border/50 p-8 flex flex-col justify-between relative overflow-hidden group transition-all duration-300 hover:border-border hover:shadow-xl hover:shadow-black/20">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 via-transparent to-blue-500/5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none group-hover:bg-primary/10 transition-colors duration-500" />

          <div className="absolute top-0 right-0 p-8 text-muted-foreground/20 group-hover:text-blue-500/30 group-hover:scale-110 transition-all duration-500 pointer-events-none">
            <PenLine className="w-16 h-16" strokeWidth={1.5} style={{ transform: 'translate(10%, -10%)' }} />
          </div>

          <div>
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <span className="w-2 h-2 rounded-full bg-blue-500/80 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
              <span className="text-sm font-medium tracking-wide uppercase">Чернетки</span>
            </div>
            <p className="text-sm text-muted-foreground/80 mt-1 max-w-[80%]">Потребують редагування або генерації</p>
          </div>

          <div className="mt-8 text-6xl lg:text-7xl font-bold tracking-tighter tabular-nums drop-shadow-md">
            {stats.totalDraft}
          </div>
        </div>

        {/* Secondary Stats Row (spans full width, nested grid) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:col-span-12">

          <div className="rounded-2xl bg-background border border-border/50 p-6 flex items-center justify-between group hover:border-blue-500/30 hover:shadow-lg hover:shadow-black/10 transition-all duration-300">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Збережені статті</p>
              <p className="text-3xl font-bold tabular-nums group-hover:text-blue-500 transition-colors">{stats.totalArticles}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-card flex items-center justify-center text-muted-foreground group-hover:text-blue-400 group-hover:scale-110 transition-all border border-border/40">
              <FileText className="w-5 h-5" />
            </div>
          </div>

          <div className="rounded-2xl bg-background border border-border/50 p-6 flex items-center justify-between group hover:border-blue-500/30 hover:shadow-lg hover:shadow-black/10 transition-all duration-300">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">В плані</p>
              <p className="text-3xl font-bold tabular-nums group-hover:text-blue-500 transition-colors">{stats.totalPlanned}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-card flex items-center justify-center text-muted-foreground group-hover:text-blue-400 group-hover:scale-110 transition-all border border-border/40">
              <CalendarRange className="w-5 h-5" />
            </div>
          </div>

          <div className="rounded-2xl bg-background border border-border/50 p-6 flex items-center justify-between group hover:border-blue-500/30 hover:shadow-lg hover:shadow-black/10 transition-all duration-300">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Опубліковано</p>
              <p className="text-3xl font-bold tabular-nums group-hover:text-blue-500 transition-colors">{stats.totalPublished}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-card flex items-center justify-center text-muted-foreground group-hover:text-blue-400 group-hover:scale-110 transition-all border border-border/40">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

        </div>

        {/* Workflow / How it works (Full width but elegant row) */}
        <div className="md:col-span-12 rounded-[1.5rem] border border-border/40 bg-zinc-950/30 p-8 relative mt-2">
          <div className="flex items-center gap-3 mb-8">
            <Activity className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-semibold text-lg">Як це працює</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="relative group">
                  <div className="flex flex-col gap-4">
                    <div className="w-12 h-12 rounded-full bg-card border border-border/60 flex items-center justify-center shrink-0 text-muted-foreground group-hover:border-blue-500/40 group-hover:text-blue-400 group-hover:scale-110 group-hover:shadow-[0_0_15px_rgba(59,130,246,0.2)] transition-all shadow-sm relative z-10">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-medium text-base mb-2 group-hover:text-primary transition-colors">{step.title}</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                  {/* Connector Line (hidden on small screens, last item has no line) */}
                  {i < 3 && (
                    <div className="hidden lg:block absolute top-6 left-16 right-[-2rem] h-[1px] bg-border/40 z-0" />
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}
