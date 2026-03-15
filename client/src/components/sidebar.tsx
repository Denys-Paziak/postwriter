'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Lightbulb, CalendarRange, Settings, Zap, ChevronRight } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Дашборд', icon: LayoutDashboard },
  { href: '/ideas', label: 'Ідеї', icon: Lightbulb },
  { href: '/content-plan', label: 'Контент-план', icon: CalendarRange },
  { href: '/settings', label: 'Налаштування', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-72 h-screen sticky top-0 flex flex-col bg-background border-r border-border/40">
      {/* Logo */}
      <div className="p-6 pb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[10px] bg-primary flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" fill="white" />
          </div>
          <div>
            <h1 className="text-[17px] font-bold tracking-tight text-foreground">SMM Planner</h1>
            <p className="text-[12px] text-muted-foreground font-medium">AI Content Studio</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 px-3 mb-3">
          Меню
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200',
                isActive
                  ? 'bg-primary/10 text-white border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-transparent'
              )}
            >
              <Icon
                className={cn('w-[1.1rem] h-[1.1rem] shrink-0', isActive ? 'text-primary' : '')}
              />
              <span className="flex-1">{item.label}</span>
              {isActive && (
                <ChevronRight className="w-4 h-4 shrink-0 text-primary" />
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
