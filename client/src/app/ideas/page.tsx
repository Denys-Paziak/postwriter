'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2, Plus, ExternalLink, Globe,
  Lightbulb, X, RefreshCw, Check, ArrowRight, Wand2,
  FileEdit, BookOpen, Search, Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";

interface DiscoveredArticle {
  url: string;
  title: string;
  image: string | null;
  excerpt: string | null;
}

interface LibraryArticle {
  id: number;
  url: string;
  title: string;
  content: string;
  image_url: string | null;
  source: string;
  created_at: string;
  plan_id?: number;
}

interface SavedSource {
  id: number;
  url: string;
  name: string;
  created_at: string;
}

type SourceStatus = 'checking' | 'ok' | 'error';

function getDomain(url: string) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
}

function SourceDot({ status }: { status?: SourceStatus }) {
  if (status === 'checking') return <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />;
  if (status === 'ok') return <span className="w-2 h-2 rounded-full bg-primary shrink-0 inline-block shadow-[0_0_8px_rgba(59,130,246,0.5)]" />;
  if (status === 'error') return <span className="w-2 h-2 rounded-full bg-destructive shrink-0 inline-block" />;
  return <span className="w-2 h-2 rounded-full bg-border/60 shrink-0 inline-block" />;
}

export default function IdeasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [viewMode, setViewMode] = useState<'discover' | 'library'>('discover');
  const [url, setUrl] = useState('');
  const [articles, setArticles] = useState<DiscoveredArticle[]>([]);
  const [libraryArticles, setLibraryArticles] = useState<LibraryArticle[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [sources, setSources] = useState<SavedSource[]>([]);
  const [sourceStatuses, setSourceStatuses] = useState<Record<number, SourceStatus>>({});
  const [loading, setLoading] = useState(false);
  const [scanningAll, setScanningAll] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);
  const [addingUrls, setAddingUrls] = useState<Set<string>>(new Set());
  const [generatingUrls, setGeneratingUrls] = useState<Set<string>>(new Set());
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [visibleCount, setVisibleCount] = useState(12);
  const [librarySearch, setLibrarySearch] = useState('');

  const [selectedLibraryArticle, setSelectedLibraryArticle] = useState<LibraryArticle | null>(null);
  const [articleToDelete, setArticleToDelete] = useState<LibraryArticle | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const view = searchParams.get('view');
    if (view === 'library') {
      setViewMode('library');
    } else {
      setViewMode('discover');
    }
  }, [searchParams]);

  useEffect(() => {
    if (viewMode === 'library') {
      loadLibrary();
    }
  }, [viewMode]);

  useEffect(() => {
    fetch(apiUrl('/api/sources'))
      .then(r => r.json())
      .then((loadedSources: SavedSource[]) => {
        setSources(loadedSources);
        if (loadedSources.length > 0) {
          scanSources(loadedSources);
        }
      });
  }, []);

  const handleDiscover = async (searchUrl?: string) => {
    const targetUrl = searchUrl || url.trim();
    if (!targetUrl) return;
    setLoading(true);
    setError('');

    try {
      await fetch(apiUrl('/api/sources'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });
      const sourcesRes = await fetch(apiUrl('/api/sources'));
      const updatedSources: SavedSource[] = await sourcesRes.json();
      setSources(updatedSources);

      const thisSource = updatedSources.find(s => s.url === targetUrl);
      if (thisSource) {
        setSourceStatuses(prev => ({ ...prev, [thisSource.id]: 'checking' }));
      }

      const res = await fetch(apiUrl('/api/articles/discover'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });
      const data = await res.json();

      if (thisSource) {
        setSourceStatuses(prev => ({
          ...prev,
          [thisSource.id]: res.ok && Array.isArray(data) && data.length > 0 ? 'ok' : 'error',
        }));
      }

      if (!res.ok) { setError(data.detail || 'Не вдалося знайти статті'); return; }
      if (data.length === 0) { setError('Статей не знайдено. Спробуйте інший URL.'); return; }

      setArticles(data);
      setVisibleCount(12);
      setUrl('');
      setAddedUrls(new Set());
    } catch {
      setError('Помилка мережі. Спробуйте ще раз.');
    } finally {
      setLoading(false);
    }
  };

  const scanSources = async (sourcesToScan: SavedSource[]) => {
    if (sourcesToScan.length === 0) return;
    setScanningAll(true);
    setScanProgress({ current: 0, total: sourcesToScan.length });
    setError('');
    setArticles([]);
    setAddedUrls(new Set());

    const allArticles: DiscoveredArticle[] = [];
    const seenUrls = new Set<string>();

    for (let i = 0; i < sourcesToScan.length; i++) {
      const source = sourcesToScan[i];
      setScanProgress({ current: i + 1, total: sourcesToScan.length });
      setSourceStatuses(prev => ({ ...prev, [source.id]: 'checking' }));
      try {
        const res = await fetch(apiUrl('/api/articles/discover'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: source.url }),
        });
        if (res.ok) {
          const data: DiscoveredArticle[] = await res.json();
          setSourceStatuses(prev => ({
            ...prev,
            [source.id]: data.length > 0 ? 'ok' : 'error',
          }));
          for (const article of data) {
            if (!seenUrls.has(article.url)) {
              seenUrls.add(article.url);
              allArticles.push(article);
            }
          }
        } else {
          setSourceStatuses(prev => ({ ...prev, [source.id]: 'error' }));
        }
      } catch {
        setSourceStatuses(prev => ({ ...prev, [source.id]: 'error' }));
      }
    }

    setArticles(allArticles);
    setVisibleCount(12);
    setScanningAll(false);
    setScanProgress(null);
    if (allArticles.length === 0) setError('Нових статей не знайдено.');
  };

  const handleAddToPlan = async (article: DiscoveredArticle) => {
    setAddingUrls(prev => new Set(prev).add(article.url));
    try {
      const res = await fetch(apiUrl('/api/articles/extract-and-plan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: article.url }),
      });
      if (res.ok) {
        setAddedUrls(prev => new Set(prev).add(article.url));
        toast.success("Статтю додано до вашого Контент-плану.");
      } else {
        const data = await res.json();
        setError(data.detail || 'Не вдалося додати');
      }
    } catch {
      setError('Помилка мережі');
    } finally {
      setAddingUrls(prev => { const n = new Set(prev); n.delete(article.url); return n; });
    }
  };

  const handleSaveAndEdit = async (article: DiscoveredArticle) => {
    setAddingUrls(prev => new Set(prev).add(article.url));
    setError('');

    try {
      const res = await fetch(apiUrl('/api/articles/extract-and-plan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: article.url }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'Не вдалося підготувати статтю');
        return;
      }

      setAddedUrls(prev => new Set(prev).add(article.url));
      toast.show("Стаття в Контент-плані. Відкриваємо редактор...");

      const planItemId = data?.planItem?.id;
      if (typeof planItemId === 'number') {
        router.push(`/content-plan/${planItemId}?mode=write&new=1`);
        return;
      }

      setError('Статтю додано в план, але не вдалося відкрити редактор.');
    } catch {
      setError('Помилка мережі');
    } finally {
      setAddingUrls(prev => { const n = new Set(prev); n.delete(article.url); return n; });
    }
  };

  const handleGenerateArticle = async (article: DiscoveredArticle) => {
    setGeneratingUrls(prev => new Set(prev).add(article.url));
    setError('');

    try {
      const res = await fetch(apiUrl('/api/articles/extract-and-plan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: article.url }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'Не вдалося підготувати статтю');
        return;
      }

      setAddedUrls(prev => new Set(prev).add(article.url));

      const planItemId = data?.planItem?.id;
      if (typeof planItemId === 'number') {
        router.push(`/content-plan/${planItemId}?new=1`);
        return;
      }

      setError('Статтю додано в план, але не вдалося відкрити редактор.');
    } catch {
      setError('Помилка мережі');
    } finally {
      setGeneratingUrls(prev => { const n = new Set(prev); n.delete(article.url); return n; });
    }
  };

  const handleDeleteLibraryArticle = async (id: number) => {
    setIsDeleting(true);
    try {
      const res = await fetch(apiUrl(`/api/articles?id=${id}`), { method: 'DELETE' });
      if (res.ok) {
        setLibraryArticles(prev => prev.filter(a => a.id !== id));
        toast.success("Статтю видалено з бібліотеки.");
        setArticleToDelete(null);
      } else {
        toast.error("Не вдалося видалити статтю.");
      }
    } catch {
      toast.error("Помилка мережі.");
    } finally {
      setIsDeleting(false);
    }
  };

  const loadLibrary = async () => {
    setLibraryLoading(true);
    try {
      const [articlesRes, planRes] = await Promise.all([
        fetch(apiUrl('/api/articles')),
        fetch(apiUrl('/api/content-plan'))
      ]);
      const allArticles: LibraryArticle[] = await articlesRes.json();
      const planItems = await planRes.json();

      // Map plan_id if article is in content plan
      const planMap = new Map();
      planItems.forEach((p: any) => planMap.set(p.url, p.id));

      const mapped = allArticles.map(a => ({
        ...a,
        plan_id: planMap.get(a.url)
      }));

      setLibraryArticles(mapped);
    } catch {
      setError('Не вдалося завантажити бібліотеку');
    } finally {
      setLibraryLoading(false);
    }
  };

  const handleLibraryAddToPlan = async (article: LibraryArticle) => {
    setAddingUrls(prev => new Set(prev).add(article.url));
    try {
      const res = await fetch(apiUrl('/api/content-plan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: article.id }),
      });
      if (res.ok) {
        const newItem = await res.json();
        setLibraryArticles(prev => prev.map(a => a.id === article.id ? { ...a, plan_id: newItem.id } : a));
        toast.success("Статтю додано до вашого Контент-плану.");
      } else {
        const data = await res.json();
        setError(data.detail || 'Не вдалося додати');
      }
    } catch {
      setError('Помилка мережі');
    } finally {
      setAddingUrls(prev => { const n = new Set(prev); n.delete(article.url); return n; });
    }
  };

  const handleDeleteSource = async (id: number) => {
    await fetch(apiUrl(`/api/sources?id=${id}`), { method: 'DELETE' });
    setSources(prev => prev.filter(s => s.id !== id));
    setSourceStatuses(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  return (
    <div className="space-y-6">
      {/* Header with View Toggle */}
      <div className="flex flex-col gap-6 mb-8 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {viewMode === 'discover' ? 'Ідеї' : 'Бібліотека'}
          </h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">
            {viewMode === 'discover'
              ? 'Знаходьте статті та додавайте в контент-план'
              : 'Ваші збережені статті для майбутніх публікацій'}
          </p>
        </div>

        <div className="flex items-center bg-secondary/30 p-1 rounded-xl border border-border/40 w-fit self-start lg:self-center">
          <button
            onClick={() => setViewMode('discover')}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 text-sm font-medium transition-all duration-200 rounded-lg",
              viewMode === 'discover'
                ? "bg-background text-foreground shadow-sm border border-border/50"
                : "text-muted-foreground hover:bg-secondary/50"
            )}
          >
            <Lightbulb className="w-4 h-4" />
            <span>Нові ідеї</span>
          </button>
          <button
            onClick={() => setViewMode('library')}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 text-sm font-medium transition-all duration-200 rounded-lg",
              viewMode === 'library'
                ? "bg-background text-foreground shadow-sm border border-border/50"
                : "text-muted-foreground hover:bg-secondary/50"
            )}
          >
            <BookOpen className="w-4 h-4" />
            <span>Моя бібліотека</span>
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {viewMode === 'discover' ? (
          <>
            <div className="rounded-[1.5rem] bg-card border border-border/40 px-5 py-4 relative overflow-hidden shadow-sm">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  {/* ... rest of existing discover sources UI ... */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-background/50 text-muted-foreground">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-foreground">Джерела</h2>
                      <p className="text-xs text-muted-foreground">Додавайте сайти й скануйте їх в один клік</p>
                    </div>
                  </div>

                  {sources.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={() => scanSources(sources)}
                      disabled={loading || scanningAll}
                      className="h-9 w-full lg:w-auto text-sm gap-2 border-border/60"
                    >
                      {scanningAll
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {scanProgress ? `Сканування ${scanProgress.current}/${scanProgress.total}...` : 'Скануємо...'}</>
                        : <><RefreshCw className="w-3.5 h-3.5" />Сканувати всі джерела</>
                      }
                    </Button>
                  )}
                </div>

                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="relative flex-1 max-w-4xl">
                    <Input
                      placeholder="Вставте URL сайту..."
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleDiscover()}
                      className="pl-3 pr-10 bg-background/50 border-border/80 hover:border-border h-10 text-sm rounded-lg focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <Button
                      onClick={() => handleDiscover()}
                      disabled={loading || !url.trim()}
                      size="icon"
                      className="absolute right-1 top-1 h-8 w-8 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md shrink-0"
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                    </Button>
                  </div>

                  {sources.length > 0 && (
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0">
                      <span>Збережені</span>
                      <span className="rounded-full border border-border/50 bg-background/40 px-2 py-1 text-foreground">
                        {sources.length}
                      </span>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="max-w-4xl p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-sm flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={() => setError('')}><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}

                {sources.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-t border-border/30 pt-3">
                    {sources.map((source) => (
                      <div
                        key={source.id}
                        className="group flex items-center gap-2 rounded-full border border-border/60 bg-background/50 px-3 py-1.5 text-sm transition-colors hover:border-border hover:bg-background"
                      >
                        <SourceDot status={sourceStatuses[source.id]} />
                        <button
                          onClick={() => handleDiscover(source.url)}
                          disabled={loading || scanningAll}
                          className="max-w-[180px] truncate text-left text-muted-foreground transition-colors hover:text-foreground"
                          title={source.url}
                        >
                          {source.name}
                        </button>
                        <button
                          onClick={() => handleDeleteSource(source.id)}
                          className="rounded-md p-0.5 text-muted-foreground/50 transition-colors hover:text-destructive"
                          title="Видалити"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {(loading || scanningAll) && articles.length === 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border border-border/30 bg-card/20 p-5 animate-pulse flex flex-col gap-4 min-h-[260px]">
                      <div className="flex items-center justify-between">
                        <div className="h-4 bg-muted/30 rounded w-20" />
                        <div className="h-8 w-8 bg-muted/20 rounded-lg" />
                      </div>
                      <div className="space-y-3 pt-1">
                        <div className="h-4 bg-muted/60 rounded w-3/4" />
                        <div className="h-4 bg-muted/40 rounded w-2/3" />
                        <div className="h-3 bg-muted/30 rounded w-full" />
                        <div className="h-3 bg-muted/30 rounded w-5/6" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {articles.length > 0 && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-sm font-medium text-muted-foreground">
                      Знайдено <span className="text-foreground">{articles.length}</span> статей
                    </span>
                    <button
                      onClick={() => setArticles([])}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Очистити стрічку
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {articles.slice(0, visibleCount).map((article) => {
                      const isAdding = addingUrls.has(article.url);
                      const isGenerating = generatingUrls.has(article.url);
                      const isAdded = addedUrls.has(article.url);
                      const domain = getDomain(article.url);
                      const isBusy = isAdding || isGenerating;

                      return (
                        <div
                          key={article.url}
                          className={cn(
                            "group relative rounded-[1.25rem] border transition-all duration-300 p-6 flex flex-col gap-4 overflow-hidden min-h-[320px]",
                            isAdded
                              ? "border-border/30 bg-card/20"
                              : "border-border/60 bg-card hover:border-primary/30 hover:shadow-xl hover:shadow-black/10"
                          )}
                        >
                          {!isAdded && (
                            <>
                              <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-transparent to-primary/[0.03] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none group-hover:bg-primary/10 transition-colors duration-500" />
                            </>
                          )}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                              <Globe className="w-3.5 h-3.5 opacity-70" />
                              <span className="tracking-wide uppercase">{domain}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground/50 hover:text-foreground hover:bg-secondary rounded-lg -mr-2"
                              onClick={() => window.open(article.url, '_blank')}
                              title="Відкрити оригінал"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          </div>

                          <div className="space-y-2.5">
                            <h3 className={`text-lg font-semibold leading-tight tracking-tight ${isAdded ? 'text-muted-foreground' : 'text-foreground group-hover:text-primary transition-colors'}`}>
                              {article.title}
                            </h3>
                            {article.excerpt && (
                              <p className="text-[15px] text-muted-foreground/80 line-clamp-4 leading-relaxed">
                                {article.excerpt}
                              </p>
                            )}
                          </div>

                          <div className="pt-2 mt-auto flex flex-col gap-2.5">
                            <Button
                              size="sm"
                              onClick={() => handleGenerateArticle(article)}
                              disabled={isBusy}
                              className="h-9 px-4 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm w-full"
                            >
                              {isGenerating
                                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin shrink-0" /><span className="truncate">Переходимо</span></>
                                : <><Wand2 className="w-4 h-4 mr-2 shrink-0" /><span className="truncate">Згенерувати статтю</span></>}
                            </Button>

                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSaveAndEdit(article)}
                                disabled={isBusy || isAdded}
                                className={`h-9 px-3 text-[13px] font-medium transition-all rounded-lg w-full ${isAdded
                                  ? 'bg-secondary/20 text-muted-foreground border-transparent cursor-default'
                                  : 'border-border/60 bg-background/30 text-foreground hover:bg-secondary/40'
                                  }`}
                              >
                                <FileEdit className="w-3.5 h-3.5 mr-2 shrink-0" />
                                <span className="truncate">Зберегти</span>
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAddToPlan(article)}
                                disabled={isBusy || isAdded}
                                className={`h-9 px-3 text-[13px] font-medium transition-all rounded-lg w-full ${isAdded
                                  ? 'bg-secondary/50 text-muted-foreground border border-transparent hover:bg-secondary/50 cursor-default'
                                  : 'border-border/60 bg-background/30 text-foreground hover:bg-secondary/40'
                                  }`}
                              >
                                {isAdding
                                  ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin shrink-0" /><span className="truncate">Додаємо</span></>
                                  : isAdded
                                    ? <><Check className="w-3.5 h-3.5 mr-2 text-primary shrink-0" /><span className="truncate">В плані</span></>
                                    : <><Plus className="w-3.5 h-3.5 mr-2 shrink-0" /><span className="truncate">До плану</span></>}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {articles.length > visibleCount && (
                    <div className="flex justify-center pt-8 pb-4">
                      <Button
                        variant="outline"
                        onClick={() => setVisibleCount(prev => prev + 12)}
                        className="h-11 px-8 rounded-xl border-border/60 hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all group"
                      >
                        <span>Завантажити ще</span>
                        <Plus className="w-4 h-4 ml-2 group-hover:rotate-90 transition-transform" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {articles.length === 0 && !loading && !scanningAll && (
                <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-border/50 rounded-[1.5rem] bg-background/20">
                  <div className="w-16 h-16 rounded-full bg-card border border-border/60 flex items-center justify-center mb-6 shadow-sm">
                    <Lightbulb className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground mb-2">Немає статей</h3>
                  <p className="text-sm text-muted-foreground max-w-[250px] leading-relaxed">
                    Додайте URL блогу або новинарного сайту зліва, щоб витягнути з нього матеріали.
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-6">
            <div className="relative max-w-md">
              <Input
                placeholder="Пошук у бібліотеці..."
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                className="pl-10 bg-background/50 border-border/60 rounded-xl h-11"
              />
              <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-muted-foreground" />
            </div>

            {libraryLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-border/30 bg-card/20 p-5 animate-pulse min-h-[220px]" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {libraryArticles
                  .filter(a => a.title.toLowerCase().includes(librarySearch.toLowerCase()) || a.source.toLowerCase().includes(librarySearch.toLowerCase()))
                  .map((article) => {
                    const domain = getDomain(article.url);
                    const isInPlan = typeof article.plan_id === 'number';
                    const isAdding = addingUrls.has(article.url);

                    return (
                      <div
                        key={article.id}
                        className="group relative rounded-[1.25rem] border border-border/60 bg-card hover:border-primary/30 hover:shadow-xl hover:shadow-black/10 transition-all duration-300 p-6 flex flex-col gap-4 overflow-hidden"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Globe className="w-3.5 h-3.5 opacity-70" />
                            <span className="tracking-wide uppercase truncate max-w-[120px]">{domain || article.source}</span>
                          </div>
                          {isInPlan && (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary uppercase tracking-tighter">
                              <Check className="w-2.5 h-2.5" /> В плані
                            </div>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 rounded-lg -mr-2 transition-colors ml-auto"
                            onClick={(e) => {
                              e.stopPropagation();
                              setArticleToDelete(article);
                            }}
                            title="Видалити"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <h3 className="text-lg font-semibold leading-tight tracking-tight text-foreground group-hover:text-primary transition-colors line-clamp-2">
                            {article.title}
                          </h3>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{new Date(article.created_at).toLocaleDateString()}</span>
                            <span>•</span>
                            <span className="capitalize">{article.source === 'manual' ? 'Чернетка' : 'Scraped'}</span>
                          </div>
                        </div>

                        <div className="pt-2 mt-auto flex flex-col gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setSelectedLibraryArticle(article)}
                            className="h-9 px-4 text-[13px] font-medium rounded-lg bg-secondary/50 hover:bg-secondary text-foreground w-full gap-2"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            Читати текст
                          </Button>

                          {isInPlan ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => router.push(`/content-plan/${article.plan_id}`)}
                              className="h-9 px-4 text-[13px] font-medium rounded-lg border-primary/20 hover:border-primary/40 hover:bg-primary/5 text-primary w-full"
                            >
                              Відкрити в плані
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleLibraryAddToPlan(article)}
                              disabled={isAdding}
                              className="h-9 px-4 text-[13px] font-medium rounded-lg border-border/60 hover:bg-secondary/40 text-foreground w-full gap-2"
                            >
                              {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                              Додати в план
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {!libraryLoading && libraryArticles.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-border/50 rounded-[1.5rem] bg-background/20">
                <p className="text-sm text-muted-foreground">Ви ще не зберегли жодної статті.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Article Viewer Dialog */}
      <Dialog open={!!selectedLibraryArticle} onOpenChange={(open) => !open && setSelectedLibraryArticle(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden border-border/40 sm:rounded-2xl">
          {selectedLibraryArticle && (
            <>
              <DialogHeader className="p-6 pb-0 space-y-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="w-4 h-4 opacity-70" />
                  <span className="text-[11px] font-bold uppercase tracking-widest">{getDomain(selectedLibraryArticle.url) || selectedLibraryArticle.source}</span>
                </div>
                <DialogTitle className="text-2xl font-bold tracking-tight pr-8">{selectedLibraryArticle.title}</DialogTitle>
                <div className="flex items-center gap-4 text-xs text-muted-foreground pb-4 border-b border-border/20">
                  <span>Додано: {new Date(selectedLibraryArticle.created_at).toLocaleString()}</span>
                  {selectedLibraryArticle.url && selectedLibraryArticle.url.startsWith('http') && (
                    <a href={selectedLibraryArticle.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                      Оригінал <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar text-[15px] leading-relaxed text-foreground/90 font-sans whitespace-pre-wrap selection:bg-primary/20">
                {selectedLibraryArticle.content || 'Текст статті відсутній.'}
              </div>

              <DialogFooter className="p-4 bg-secondary/20 border-t border-border/20 sm:justify-end gap-2">
                <Button variant="ghost" onClick={() => setSelectedLibraryArticle(null)}>Закрити</Button>
                {selectedLibraryArticle.plan_id ? (
                  <Button
                    className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[140px]"
                    onClick={() => router.push(`/content-plan/${selectedLibraryArticle.plan_id}`)}
                  >
                    Відкрити в плані
                  </Button>
                ) : (
                  <Button
                    className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[140px]"
                    onClick={() => handleLibraryAddToPlan(selectedLibraryArticle)}
                    disabled={addingUrls.has(selectedLibraryArticle.url)}
                  >
                    {addingUrls.has(selectedLibraryArticle.url) ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Додати в план'}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!articleToDelete} onOpenChange={(open) => !open && setArticleToDelete(null)}>
        <DialogContent className="max-w-md sm:rounded-2xl border-border/40">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-xl font-bold">Видалити статтю?</DialogTitle>
            <DialogDescription className="text-muted-foreground text-[15px] leading-relaxed">
              Це назавжди видалить статтю «<span className="text-foreground font-medium">{articleToDelete?.title}</span>» з вашої бібліотеки. Ви впевнені?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="ghost"
              onClick={() => setArticleToDelete(null)}
              className="sm:flex-1"
            >
              Скасувати
            </Button>
            <Button
              variant="destructive"
              onClick={() => articleToDelete && handleDeleteLibraryArticle(articleToDelete.id)}
              disabled={isDeleting}
              className="sm:flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Видалити
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
