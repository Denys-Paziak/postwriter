'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Sparkles,
  Globe,
  Loader2,
  FileText,
  PenLine,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch, apiUrl } from '@/lib/api';

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
    style: { background: 'var(--status-draft-bg)', color: 'var(--status-draft)' },
    dotStyle: { background: 'var(--status-draft)' },
  },
  in_progress: {
    label: 'В роботі',
    style: { background: 'var(--status-progress-bg)', color: 'var(--status-progress)' },
    dotStyle: { background: 'var(--status-progress)' },
  },
  published: {
    label: 'Опубліковано',
    style: { background: 'var(--status-published-bg)', color: 'var(--status-published)' },
    dotStyle: { background: 'var(--status-published)' },
  },
};

export default function ContentPlanPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState<ArticleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingDraft, setCreatingDraft] = useState(false);

  const fetchItems = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await apiFetch('/api/content-plan', {}, { fresh: true });
      if (!res.ok) throw new Error('Failed to fetch content plan');

      const data = await res.json();
      setItems(data);
    } catch (error) {
      console.error('Failed to fetch plan items:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems, pathname]);

  useEffect(() => {
    const refreshItems = () => { void fetchItems(true); };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshItems();
      }
    };

    window.addEventListener('focus', refreshItems);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', refreshItems);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchItems]);

  const handleCreateArticle = async () => {
    setCreatingDraft(true);
    try {
      const res = await fetch(apiUrl('/api/articles/create-and-plan'), {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Не вдалося створити чернетку');
      }

      const planItemId = data?.planItem?.id;
      if (typeof planItemId !== 'number') {
        throw new Error('Не вдалося відкрити редактор');
      }

      router.push(`/content-plan/${planItemId}?mode=write&new=1`);
    } catch (error) {
      console.error('Failed to create manual draft:', error);
    } finally {
      setCreatingDraft(false);
    }
  };

  const handleDeleteItem = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
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
          onClick={handleCreateArticle}
          disabled={creatingDraft}
          className="gap-2 h-9 px-4 text-sm"
        >
          <PenLine className="w-4 h-4" />
          {creatingDraft ? 'Створюємо...' : 'Створити статтю'}
        </Button>
      </div>

      {/* Kanban Board Layout */}
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-6 pb-12 overflow-x-auto">
        {Object.entries(statusConfig).map(([statusKey, config]) => {
          const colItems = items.filter(i => i.status === statusKey);

          return (
            <div key={statusKey} className="flex-1 min-w-[320px] max-w-full lg:max-w-md flex flex-col gap-4">
              {/* Column Header */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={config.dotStyle} />
                  {config.label}
                  <Badge variant="secondary" className="ml-1 text-xs px-2 bg-secondary/50 text-muted-foreground">
                    {colItems.length}
                  </Badge>
                </div>
              </div>

              {/* Column Content */}
              <div className="flex flex-col gap-4 min-h-[150px] rounded-2xl bg-background/20 border border-dashed border-border/40 p-3">
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
                        onClick={() => { router.push(`/content-plan/${item.id}`); }}
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
                            <button
                              onClick={(e) => handleDeleteItem(e, item.id)}
                              className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive transition-colors"
                              title="Видалити"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
