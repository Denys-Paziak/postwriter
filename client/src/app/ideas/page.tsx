'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2, Plus, ExternalLink, Globe,
  Lightbulb, X, RefreshCw, Check, ArrowRight
} from 'lucide-react';
import { apiUrl } from '@/lib/api';

interface DiscoveredArticle {
  url: string;
  title: string;
  image: string | null;
  excerpt: string | null;
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
  if (status === 'ok') return <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 inline-block" />;
  if (status === 'error') return <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 inline-block" />;
  return <span className="w-2 h-2 rounded-full bg-border/60 shrink-0 inline-block" />;
}

export default function IdeasPage() {
  const [url, setUrl] = useState('');
  const [articles, setArticles] = useState<DiscoveredArticle[]>([]);
  const [sources, setSources] = useState<SavedSource[]>([]);
  const [sourceStatuses, setSourceStatuses] = useState<Record<number, SourceStatus>>({});
  const [loading, setLoading] = useState(false);
  const [scanningAll, setScanningAll] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);
  const [addingUrls, setAddingUrls] = useState<Set<string>>(new Set());
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

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
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Ideas</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Знаходьте статті та додавайте в контент-план</p>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Left Column */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="rounded-[1.25rem] bg-card border border-border/40 p-5 flex flex-col relative overflow-hidden shadow-sm">
            <h2 className="text-base font-semibold mb-4 text-foreground flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              Джерела
            </h2>

            <div className="flex flex-col gap-3">
              {/* URL input */}
              <div className="relative">
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

              {error && (
                <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-sm flex items-center justify-between">
                  <span>{error}</span>
                  <button onClick={() => setError('')}><X className="w-3.5 h-3.5" /></button>
                </div>
              )}

              {/* Sources list */}
              {sources.length > 0 && (
                <div className="mt-1">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                    Збережені ({sources.length})
                  </div>

                  <div className="flex flex-col gap-1">
                    {sources.map((source) => (
                      <div
                        key={source.id}
                        className="group flex items-center gap-2 overflow-hidden rounded-md border border-transparent hover:bg-background hover:border-border/60 transition-colors text-sm pl-2 pr-1 py-1.5"
                      >
                        <SourceDot status={sourceStatuses[source.id]} />
                        <button
                          onClick={() => handleDiscover(source.url)}
                          disabled={loading || scanningAll}
                          className="flex-1 text-muted-foreground hover:text-foreground transition-colors text-left truncate"
                          title={source.url}
                        >
                          {source.name}
                        </button>
                        <button
                          onClick={() => handleDeleteSource(source.id)}
                          className="p-1.5 text-muted-foreground/0 group-hover:text-muted-foreground/60 hover:!text-destructive transition-colors rounded-md shrink-0"
                          title="Видалити"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Scan all button */}
                  <Button
                    variant="outline"
                    onClick={() => scanSources(sources)}
                    disabled={loading || scanningAll}
                    className="w-full mt-3 h-9 text-sm gap-2 border-border/60"
                  >
                    {scanningAll
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {scanProgress ? `Сканування ${scanProgress.current}/${scanProgress.total}...` : 'Скануємо...'}</>
                      : <><RefreshCw className="w-3.5 h-3.5" />Знайти статті з усіх джерел</>
                    }
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Feed */}
        <div className="lg:col-span-8 flex flex-col gap-4">

          {/* Skeletons */}
          {(loading || scanningAll) && articles.length === 0 && (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border/30 bg-card/20 p-5 animate-pulse flex items-start gap-4">
                  <div className="flex-1 space-y-3 pt-1">
                    <div className="h-4 bg-muted/60 rounded w-3/4" />
                    <div className="h-3 bg-muted/30 rounded w-1/2" />
                  </div>
                  <div className="h-9 w-28 bg-muted/40 rounded-xl" />
                </div>
              ))}
            </div>
          )}

          {/* Article List */}
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

              <div className="flex flex-col gap-5">
                {articles.map((article) => {
                  const isAdding = addingUrls.has(article.url);
                  const isAdded = addedUrls.has(article.url);
                  const domain = getDomain(article.url);

                  return (
                    <div
                      key={article.url}
                      className={`group rounded-[1.25rem] border transition-all p-6 flex flex-col gap-4 ${isAdded
                          ? 'border-border/30 bg-card/20'
                          : 'border-border/60 bg-card hover:border-border hover:shadow-xl hover:shadow-black/5'
                        }`}
                    >
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
                        <h3 className={`text-xl font-semibold leading-tight tracking-tight ${isAdded ? 'text-muted-foreground' : 'text-foreground group-hover:text-primary transition-colors'}`}>
                          {article.title}
                        </h3>
                        {article.excerpt && (
                          <p className="text-[15px] text-muted-foreground/80 line-clamp-3 leading-relaxed">
                            {article.excerpt}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 flex items-center gap-3">
                        <Button
                          size="sm"
                          onClick={() => handleAddToPlan(article)}
                          disabled={isAdding || isAdded}
                          className={`h-9 px-4 text-sm font-medium transition-all rounded-lg ${isAdded
                              ? 'bg-secondary/50 text-muted-foreground border border-transparent hover:bg-secondary/50 cursor-default'
                              : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                            }`}
                        >
                          {isAdding
                            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Додаємо</>
                            : isAdded
                              ? <><Check className="w-4 h-4 mr-2 text-emerald-500" />В плані</>
                              : <><Plus className="w-4 h-4 mr-2" />Додати до плану</>}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty State */}
          {articles.length === 0 && !loading && !scanningAll && (
            <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-border/50 rounded-[1.5rem] bg-zinc-950/20">
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
      </div>
    </div>
  );
}
