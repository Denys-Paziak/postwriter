'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Lightbulb, CalendarRange, Sparkles, Settings } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/ideas', label: 'Ideas', icon: Lightbulb },
  { href: '/content-plan', label: 'Content Plan', icon: CalendarRange },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-72 min-h-screen bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="p-6 pb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-primary flex items-center justify-center shadow-lg shadow-black/20">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">SMM Planner</h1>
            <p className="text-sm text-muted-foreground">AI Content Studio</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-3">
          Menu
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-accent text-accent-foreground border border-border/50 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-transparent'
              )}
            >
              <Icon className={cn('w-[#1.125rem] h-[#1.125rem]', isActive ? 'text-foreground' : 'text-muted-foreground')} />
              {item.label}
              {isActive && (
                <div className="ml-auto w-1 h-1 rounded-full bg-foreground" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 m-4 rounded-xl bg-card border border-border/60 shadow-sm relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
        <p className="text-sm font-medium mb-1">SMM Planner</p>
        <p className="text-xs text-muted-foreground">
          Powered by Google Gemini AI
        </p>
      </div>
    </aside>
  );
}
