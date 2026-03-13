'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Sparkles,
  Globe,
  Loader2,
  FileText,
  X,
  PenLine,
  MoreHorizontal,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/api';

interface ArticleItem {
  id: number;
  source: string;
  title: string;
  url: string;
  status: 'draft' | 'in_progress' | 'published';
  created_at?: string;
  content?: string;
  research?: string;
  generated_post?: string;
}

const statusConfig = {
  draft: {
    label: 'Чернетка',
    bg: 'bg-zinc-100 dark:bg-zinc-800/80',
    color: 'text-zinc-600 dark:text-zinc-400',
    border: 'border-zinc-200 dark:border-zinc-800',
    dot: 'bg-zinc-400 dark:bg-zinc-500',
  },
  in_progress: {
    label: 'В роботі',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    color: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-500/30',
    dot: 'bg-blue-500 dark:bg-blue-400',
  },
  published: {
    label: 'Опубліковано',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    color: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-500/30',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
  }
};

export default function ContentPlanPage() {
  const router = useRouter();
  const [items, setItems] = useState<ArticleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualContent, setManualContent] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [manualError, setManualError] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    if (openMenuId === null) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenuId]);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await fetch(apiUrl('/api/content-plan'));
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (error) {
      console.error('Failed to fetch plan items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualTitle.trim() || !manualContent.trim()) {
      setManualError("Назва та текст статті обов'язкові");
      return;
    }
    setManualSaving(true);
    setManualError('');
    try {
      const res = await fetch(apiUrl('/api/articles/manual-and-plan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: manualTitle, content: manualContent, url: manualUrl || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setManualError(data.detail || 'Помилка збереження');
        return;
      }
      setShowManual(false);
      setManualTitle('');
      setManualContent('');
      setManualUrl('');
      fetchItems();
    } catch {
      setManualError('Помилка мережі');
    } finally {
      setManualSaving(false);
    }
  };

  const handleDeleteItem = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setOpenMenuId(null);
    await fetch(apiUrl(`/api/content-plan?id=${id}`), { method: 'DELETE' });
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const getDomain = (url: string) => {
    if (!url) return '';
    try {
      const { hostname } = new URL(url);
      return hostname.replace('www.', '');
    } catch {
      return '';
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground font-medium tracking-wide">Завантаження плану...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Контент-план</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Огляд та керування процесом створення контенту</p>
        </div>
        <Button
          onClick={() => { setShowManual(true); setManualError(''); }}
          className="gap-2 h-9 px-4 text-sm"
        >
          <PenLine className="w-4 h-4" />
          Додати вручну
        </Button>
      </div>

      {/* Manual entry modal */}
      {showManual && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowManual(false); }}
        >
          <div ref={modalRef} className="bg-card border border-border/60 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col gap-5 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Додати статтю вручну</h2>
              <button onClick={() => setShowManual(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Назва <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  value={manualTitle}
                  onChange={e => setManualTitle(e.target.value)}
                  placeholder="Заголовок статті..."
                  className="h-10 px-3 rounded-lg border border-border/80 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Текст статті <span className="text-destructive">*</span></label>
                <textarea
                  value={manualContent}
                  onChange={e => setManualContent(e.target.value)}
                  placeholder="Вставте або напишіть текст статті..."
                  rows={8}
                  className="px-3 py-2.5 rounded-lg border border-border/80 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none leading-relaxed"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">
                  URL <span className="text-muted-foreground text-xs font-normal">(необов'язково)</span>
                </label>
                <input
                  type="text"
                  value={manualUrl}
                  onChange={e => setManualUrl(e.target.value)}
                  placeholder="https://..."
                  className="h-10 px-3 rounded-lg border border-border/80 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {manualError && (
                <p className="text-sm text-destructive">{manualError}</p>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowManual(false)} disabled={manualSaving}>
                Скасувати
              </Button>
              <Button onClick={handleManualSubmit} disabled={manualSaving} className="gap-2">
                {manualSaving ? <><Loader2 className="w-4 h-4 animate-spin" />Збереження...</> : 'Додати до плану'}
              </Button>
            </div>
          </div>
        </div>
      )}



      {/* Kanban Board Layout */}
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-6 pb-12 overflow-x-auto">
        {Object.entries(statusConfig).map(([statusKey, config]) => {
          const colItems = items.filter(i => i.status === statusKey);

          return (
            <div key={statusKey} className="flex-1 min-w-[320px] max-w-full lg:max-w-md flex flex-col gap-4">
              {/* Column Header */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <div className={`w-2.5 h-2.5 rounded-full ${config.dot} shadow-sm`} />
                  {config.label}
                  <Badge variant="secondary" className="ml-1 text-xs px-2 bg-secondary/50 text-muted-foreground">
                    {colItems.length}
                  </Badge>
                </div>
              </div>

              {/* Column Content */}
              <div className="flex flex-col gap-4 min-h-[150px] rounded-2xl bg-zinc-950/20 border border-dashed border-border/40 p-3">
                {colItems.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-10 text-center opacity-60">
                    <p className="text-sm text-muted-foreground">Немає карток</p>
                  </div>
                ) : (
                  colItems.map((item) => {
                    const domain = getDomain(item.url);

                    return (
                      <div
                        key={item.id}
                        className="group rounded-xl border border-border/60 bg-card/80 hover:bg-card hover:border-border hover:shadow-md transition-all cursor-pointer overflow-hidden p-4 flex flex-col gap-3 relative"
                        onClick={() => { setOpenMenuId(null); router.push(`/content-plan/${item.id}`); }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest bg-secondary/50 px-2 py-0.5 rounded-md truncate max-w-[120px]">
                            <Globe className="w-3 h-3 shrink-0" />
                            <span className="truncate">{domain || item.source}</span>
                          </span>

                          <div className="flex items-center gap-1">
                            {item.research ? (
                              <span className="flex items-center justify-center w-6 h-6 rounded-md bg-secondary text-muted-foreground" title="Досліджено">
                                <Search className="w-3 h-3" />
                              </span>
                            ) : null}
                            {item.generated_post ? (
                              <span className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary" title="Пост готовий">
                                <Sparkles className="w-3 h-3" />
                              </span>
                            ) : null}
                            <div className="relative">
                              <button
                                onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === item.id ? null : item.id); }}
                                className="flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground/0 group-hover:text-muted-foreground hover:bg-secondary hover:!text-foreground transition-colors"
                              >
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </button>
                              {openMenuId === item.id && (
                                <div
                                  className="absolute right-0 top-7 z-20 w-36 bg-popover border border-border/60 rounded-lg shadow-lg py-1 text-sm"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={(e) => handleDeleteItem(e, item.id)}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-destructive hover:bg-destructive/10 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Видалити
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <h3 className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-3">
                          {item.title}
                        </h3>

                        <div className="pt-2 mt-1 border-t border-border/40 text-[11px] text-muted-foreground flex items-center justify-between opacity-60 group-hover:opacity-100 transition-opacity">
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            Відкрити редактор
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
