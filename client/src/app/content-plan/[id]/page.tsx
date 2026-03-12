'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import {
    ArrowLeft,
    ExternalLink,
    Wand2,
    RefreshCw,
    Copy,
    Check,
    Loader2,
    Save,
    Trash2,
    Sparkles,
    Search,
    BookOpen,
    Globe,
    MessageSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectValue, SelectTrigger } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

type PostTone = 'value' | 'story' | 'insight' | 'opinion';

const toneOptions: { key: PostTone; label: string; icon: React.ElementType }[] = [
    { key: 'value', label: 'Цінність', icon: BookOpen },
    { key: 'opinion', label: 'Думка', icon: MessageSquare },
    { key: 'story', label: 'Історія', icon: Sparkles },
    { key: 'insight', label: 'Інсайт', icon: Search }
];

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
    carousel_url?: string;
    cover_image_url?: string;
}

// Step progress component used for both generation and research
function StepProgress({
    steps,
    total,
    icon: Icon,
    title,
    subtitle,
}: {
    steps: string[];
    total: number;
    icon: React.ElementType;
    title: string;
    subtitle: string;
}) {
    const pct = Math.max(4, Math.round((steps.length / total) * 100));
    return (
        <div className="w-full max-w-xs">
            <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary animate-pulse" />
                </div>
                <div>
                    <p className="font-semibold text-sm text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground">{subtitle}</p>
                </div>
            </div>

            <div className="space-y-2.5 min-h-[60px]">
                {steps.slice(0, -1).map((step, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground/60 animate-in fade-in duration-300">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="leading-snug">{step}</span>
                    </div>
                ))}
                {steps.length > 0 ? (
                    <div className="flex items-start gap-2.5 text-sm text-foreground font-medium animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0 mt-0.5" />
                        <span className="leading-snug">{steps[steps.length - 1]}</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                        <span>Запускаємо...</span>
                    </div>
                )}
            </div>

            <div className="mt-5 space-y-1.5">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{steps.length}/{total} кроків</span>
                    <span>{pct}%</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all duration-700 ease-out rounded-full"
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>
        </div>
    );
}

export default function ContentPlanEditorPage() {
    const params = useParams();
    const router = useRouter();
    const id = parseInt(params.id as string, 10);

    const [item, setItem] = useState<ArticleItem | null>(null);
    const [loading, setLoading] = useState(true);

    const [activeTab, setActiveTab] = useState<'source' | 'research'>('source');
    const [selectedTone, setSelectedTone] = useState<PostTone>('value');

    const [generating, setGenerating] = useState(false);
    const [generateSteps, setGenerateSteps] = useState<string[]>([]);

    const [researching, setResearching] = useState(false);
    const [researchSteps, setResearchSteps] = useState<string[]>([]);

    const [error, setError] = useState<string>('');
    const [researchError, setResearchError] = useState<string>('');

    const [editingPost, setEditingPost] = useState<string>('');
    const [isEditing, setIsEditing] = useState(false);
    const [copied, setCopied] = useState(false);

    const [generatingCarousel, setGeneratingCarousel] = useState(false);
    const [generatingImage, setGeneratingImage] = useState(false);

    useEffect(() => {
        if (isNaN(id)) return;
        const controller = new AbortController();

        (async () => {
            try {
                setLoading(true);
                setError('');
                const res = await fetch(apiUrl(`/api/content-plan/${id}`), { signal: controller.signal });
                if (!res.ok) throw new Error('Item not found');
                const data = await res.json();
                setItem(data);
                if (data.generated_post) setEditingPost(data.generated_post);
                if (data.research) setActiveTab('research');
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                setError('Не вдалося завантажити статтю.');
                toast.error('Не вдалося завантажити статтю.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        })();

        return () => controller.abort();
    }, [id]);


    const handleStatusChange = async (newStatus: string | null) => {
        if (!item || !newStatus) return;
        try {
            const res = await fetch(apiUrl(`/api/content-plan/${item.id}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) throw new Error();
            setItem(await res.json());
        } catch {
            toast.error('Помилка оновлення статусу');
        }
    };

    const handleResearch = async () => {
        if (!item) return;
        setResearching(true);
        setResearchSteps([]);
        setResearchError('');
        try {
            const res = await fetch(apiUrl('/api/research'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content_plan_id: item.id }),
            });
            if (!res.ok || !res.body) throw new Error('Помилка дослідження');

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            outer: while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split(/\r?\n\r?\n/);
                buffer = events.pop() ?? '';
                for (const event of events) {
                    const line = event.trim();
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const payload = JSON.parse(line.slice(6));
                        if (payload.type === 'progress') {
                            setResearchSteps(prev => [...prev, payload.message]);
                        } else if (payload.type === 'done') {
                            setItem(payload.item);
                            setActiveTab('research');
                            setResearching(false);
                            setResearchSteps([]);
                            break outer;
                        } else if (payload.type === 'error') {
                            const msg = payload.message || 'Не вдалося виконати дослідження.';
                            setResearchError(msg);
                            toast.error(msg);
                            setResearching(false);
                            break outer;
                        }
                    } catch { /* ignore malformed */ }
                }
            }
        } catch {
            const msg = 'Не вдалося виконати дослідження.';
            setResearchError(msg);
            toast.error(msg);
        } finally {
            setResearching(false);
        }
    };

    const handleGenerate = async () => {
        if (!item) return;
        setGenerating(true);
        setGenerateSteps([]);
        try {
            const res = await fetch(apiUrl('/api/generate'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content_plan_id: item.id, tone: selectedTone }),
            });
            if (!res.ok || !res.body) throw new Error('Validation or API error');

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            outer: while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split(/\r?\n\r?\n/);
                buffer = events.pop() ?? '';
                for (const event of events) {
                    const line = event.trim();
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const payload = JSON.parse(line.slice(6));
                        if (payload.type === 'progress') {
                            setGenerateSteps(prev => [...prev, payload.message]);
                        } else if (payload.type === 'done') {
                            setItem(payload.item);
                            setEditingPost(payload.item.generated_post ?? '');
                            setIsEditing(false);
                            setGenerating(false);
                            setGenerateSteps([]);
                            break outer;
                        } else if (payload.type === 'error') {
                            toast.error(payload.message || 'Не вдалося згенерувати пост.');
                            setGenerating(false);
                            setGenerateSteps([]);
                            break outer;
                        }
                    } catch { /* ignore malformed */ }
                }
            }
        } catch {
            toast.error('Не вдалося згенерувати пост. Спробуйте ще раз.');
        } finally {
            setGenerating(false);
        }
    };

    const handleSavePost = async () => {
        if (!item) return;
        try {
            const res = await fetch(apiUrl(`/api/content-plan/${item.id}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ generated_post: editingPost }),
            });
            if (!res.ok) throw new Error();
            setItem(await res.json());
            setIsEditing(false);
        } catch {
            toast.error('Не вдалося зберегти зміни.');
        }
    };

    const handleDelete = async () => {
        if (!item) return;
        if (confirm('Ви впевнені, що хочете видалити цей пункт?')) {
            try {
                const res = await fetch(apiUrl(`/api/content-plan?id=${item.id}`), { method: 'DELETE' });
                if (!res.ok) throw new Error();
                router.push('/content-plan');
            } catch {
                toast.error('Не вдалося видалити пункт.');
            }
        }
    };

    const handleCopy = () => {
        if (editingPost) {
            navigator.clipboard.writeText(editingPost);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleGenerateCarousel = async () => {
        if (!item) return;
        setGeneratingCarousel(true);
        try {
            const res = await fetch(apiUrl(`/api/visual/${item.id}/carousel`), { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Помилка генерації');
            setItem(data.item);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Не вдалося згенерувати карусель');
        } finally {
            setGeneratingCarousel(false);
        }
    };

    const handleGenerateImage = async () => {
        if (!item) return;
        setGeneratingImage(true);
        try {
            const res = await fetch(apiUrl(`/api/visual/${item.id}/image`), { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Помилка генерації');
            setItem(data.item);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Не вдалося згенерувати зображення';
            toast.error(msg.includes('imagen') || msg.includes('Imagen') || msg.includes('400') || msg.includes('403')
                ? 'Imagen API недоступний — потрібен платний тариф Gemini'
                : msg);
        } finally {
            setGeneratingImage(false);
        }
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">Завантаження редактора...</p>
        </div>
    );

    if (error && !item) return (
        <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <Trash2 className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-bold mb-2">Помилка</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button onClick={() => router.push('/content-plan')} variant="outline">Повернутися до плану</Button>
        </div>
    );

    if (!item) return null;

    const displaySource = (() => {
        try { return new URL(item.url ?? '').hostname.replace('www.', '') || (item.source ?? ''); }
        catch { return item.source ?? ''; }
    })();

    return (
        <div className="space-y-6 pb-20 max-w-6xl mx-auto">
            {/* Top bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border/50 p-4 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/content-plan')} className="shrink-0 rounded-full hover:bg-secondary">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Globe className="w-4 h-4" />
                        <span className="truncate max-w-[200px]">{displaySource}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={item.status} onValueChange={handleStatusChange}>
                        <SelectTrigger className="w-[140px] h-9 text-xs bg-secondary/50 border-0 font-medium">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="draft">Чернетка</SelectItem>
                            <SelectItem value="in_progress">В роботі</SelectItem>
                            <SelectItem value="published">Опубліковано</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={handleDelete} className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full h-9 w-9">
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Title */}
            <div className="px-2">
                <h1 className="text-3xl font-bold tracking-tight text-foreground leading-tight">{item.title}</h1>
            </div>

            {/* Main 2-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Left: Source & Research */}
                <div className="lg:col-span-5 flex flex-col gap-4">
                    <div className="bg-card border border-border/60 rounded-2xl overflow-hidden flex flex-col h-[600px] shadow-sm">
                        {/* Tabs */}
                        <div className="flex border-b border-border/50 bg-secondary/30">
                            <button
                                className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'source' ? 'border-primary text-foreground bg-background' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}
                                onClick={() => setActiveTab('source')}
                            >
                                Оригінал статті
                            </button>
                            <button
                                className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 flex items-center justify-center gap-1.5 ${activeTab === 'research' ? 'border-primary text-foreground bg-background' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}
                                onClick={() => setActiveTab('research')}
                            >
                                {item.research && !researching ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : null}
                                {researching ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : null}
                                Дослідження
                            </button>
                        </div>

                        {/* Tab content */}
                        <div className="flex-1 overflow-y-auto p-5 text-sm leading-relaxed text-muted-foreground custom-scrollbar">
                            {activeTab === 'source' ? (
                                <div className="whitespace-pre-line relative">
                                    <div className="absolute top-0 right-0">
                                        {item.url && item.url.startsWith('http') && (
                                            <Button variant="outline" size="sm" onClick={() => window.open(item.url!, '_blank')} className="h-7 text-xs shadow-sm bg-background/80 backdrop-blur-sm">
                                                Відкрити <ExternalLink className="w-3 h-3 ml-1.5" />
                                            </Button>
                                        )}
                                    </div>
                                    <div className="pt-8">{item.content || 'Текст статті відсутній.'}</div>
                                </div>
                            ) : (
                                <div className="relative min-h-full flex flex-col">
                                    {/* Has research */}
                                    {item.research && (
                                        <>
                                            <div className="absolute top-0 right-0 flex flex-col items-end gap-1.5">
                                                <Button variant="ghost" size="sm" onClick={handleResearch} disabled={researching} className="h-7 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm shadow-sm ring-1 ring-border">
                                                    {researching ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
                                                    {researching ? 'Оновлюємо...' : 'Оновити'}
                                                </Button>
                                                {/* Compact progress when refreshing */}
                                                {researching && researchSteps.length > 0 && (
                                                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground animate-pulse pr-1">
                                                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                                        {researchSteps[researchSteps.length - 1]}
                                                    </div>
                                                )}
                                                {researchError && (
                                                    <span className="text-[10px] text-destructive pr-1 max-w-[200px] text-right">{researchError}</span>
                                                )}
                                            </div>
                                            <div className="pt-8 text-[15px] whitespace-pre-line">
                                                {item.research}
                                            </div>
                                        </>
                                    )}

                                    {/* No research — idle */}
                                    {!item.research && !researching && (
                                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                                            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4 border border-border">
                                                <Search className="w-6 h-6 text-muted-foreground" />
                                            </div>
                                            <h3 className="text-base font-semibold text-foreground mb-2">Дослідження відсутнє</h3>
                                            <p className="text-sm max-w-[240px] mx-auto mb-6 text-muted-foreground">Проведіть дослідження аудиторії перед генерацією — це покращить якість поста.</p>
                                            {researchError && (
                                                <p className="text-xs text-destructive mb-4 max-w-[260px] text-center">{researchError}</p>
                                            )}
                                            <Button onClick={handleResearch}>
                                                <Search className="w-4 h-4 mr-2" />
                                                Провести дослідження
                                            </Button>
                                        </div>
                                    )}

                                    {/* No research — in progress */}
                                    {!item.research && researching && (
                                        <div className="flex-1 flex flex-col items-center justify-center">
                                            <StepProgress
                                                steps={researchSteps}
                                                total={4}
                                                icon={Search}
                                                title="Дослідження аудиторії"
                                                subtitle="~1 хвилина"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Generation Editor */}
                <div className="lg:col-span-7 flex flex-col gap-4">
                    <div className="bg-card border border-border/60 rounded-2xl shadow-sm flex flex-col h-[600px] overflow-hidden">

                        {/* Toolbar */}
                        <div className="p-4 border-b border-border/50 bg-secondary/20 flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-1 bg-background p-1 rounded-lg border border-border shadow-sm">
                                {toneOptions.map(tone => {
                                    const Icon = tone.icon;
                                    const isActive = selectedTone === tone.key;
                                    return (
                                        <button
                                            key={tone.key}
                                            onClick={() => setSelectedTone(tone.key)}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${isActive
                                                ? 'bg-foreground text-background shadow-md'
                                                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                                                }`}
                                        >
                                            <Icon className="w-3.5 h-3.5" />
                                            {tone.label}
                                        </button>
                                    );
                                })}
                            </div>

                            <Button
                                onClick={handleGenerate}
                                disabled={generating}
                                className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm h-9 px-4 text-xs font-semibold"
                            >
                                {generating
                                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Генеруємо...</>
                                    : <><Wand2 className="w-4 h-4 mr-2" />Створити пост</>
                                }
                            </Button>
                        </div>

                        {/* Editor area */}
                        <div className="flex-1 relative bg-background overflow-hidden">

                            {/* Generation progress overlay */}
                            {generating && (
                                <div className="absolute inset-0 z-10 bg-background/96 backdrop-blur-[2px] flex items-center justify-center p-8">
                                    <StepProgress
                                        steps={generateSteps}
                                        total={7}
                                        icon={Sparkles}
                                        title="Генерація поста"
                                        subtitle="~1-2 хвилини"
                                    />
                                </div>
                            )}

                            {/* Empty state */}
                            {!item.generated_post && !editingPost && !generating && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 opacity-60 pointer-events-none">
                                    <Wand2 className="w-12 h-12 text-muted-foreground mb-4" />
                                    <p className="text-lg font-medium text-foreground">Чернетка порожня</p>
                                    <p className="text-sm mt-1 max-w-[280px] text-muted-foreground">Оберіть стиль розповіді зверху та натисніть «Створити пост»</p>
                                </div>
                            )}

                            {/* Post content */}
                            {(editingPost || item.generated_post) && !generating && (
                                <div className="h-full flex flex-col">
                                    {isEditing ? (
                                        <Textarea
                                            value={editingPost}
                                            onChange={(e) => setEditingPost(e.target.value)}
                                            className="flex-1 border-0 rounded-none resize-none focus-visible:ring-0 p-6 text-[15px] leading-relaxed custom-scrollbar bg-transparent"
                                            placeholder="Напишіть або згенеруйте ваш пост тут..."
                                        />
                                    ) : (
                                        <div
                                            className="flex-1 overflow-y-auto p-6 text-[15px] leading-relaxed whitespace-pre-line custom-scrollbar cursor-text group"
                                            onClick={() => setIsEditing(true)}
                                        >
                                            <div className="text-foreground/90 group-hover:text-foreground transition-colors">
                                                {editingPost}
                                            </div>
                                            <div className="fixed bottom-24 right-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                <span className="bg-foreground text-background text-xs font-semibold px-3 py-2 rounded-full shadow-lg flex items-center gap-1.5">
                                                    Клікніть для редагування
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Footer */}
                                    <div className="border-t border-border/50 bg-secondary/10 p-3 flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground font-medium pl-2">
                                            {editingPost.length} символів
                                        </span>
                                        <div className="flex items-center gap-2">
                                            {isEditing && (
                                                <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="text-xs h-8">
                                                    Скасувати
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant={isEditing ? 'default' : 'outline'}
                                                onClick={handleSavePost}
                                                className={`text-xs h-8 ${isEditing ? 'bg-foreground text-background hover:bg-foreground/90' : 'bg-card'}`}
                                            >
                                                <Save className="w-3.5 h-3.5 mr-1.5" />Зберегти
                                            </Button>
                                            {!isEditing && (
                                                <Button size="sm" className="text-xs h-8 bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80" onClick={handleCopy}>
                                                    {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                                                    {copied ? 'Скопійовано!' : 'Копіювати'}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Visual Content */}
            <div className="bg-card border border-border/60 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border/50 bg-secondary/20">
                    <h2 className="text-sm font-semibold text-foreground">Візуальний контент</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Зображення та карусель для публікації в LinkedIn</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border/30">

                    {/* Cover image */}
                    <div className="bg-card p-5 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-foreground">Зображення для посту</p>
                                <p className="text-xs text-muted-foreground mt-0.5">1080×1080px · PNG</p>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleGenerateImage}
                                disabled={generatingImage}
                                className="h-8 text-xs gap-1.5 shrink-0"
                            >
                                {generatingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                {generatingImage ? 'Генеруємо...' : 'Генерувати'}
                            </Button>
                        </div>
                        {item.cover_image_url ? (
                            <div className="flex flex-col gap-2">
                                <img
                                    src={apiUrl(item.cover_image_url)}
                                    alt="Cover"
                                    className="w-full aspect-square object-cover rounded-xl border border-border/50"
                                />
                                <a
                                    href={apiUrl(item.cover_image_url)}
                                    download
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-border/60 bg-secondary/50 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                                >
                                    Завантажити PNG
                                </a>
                            </div>
                        ) : (
                            <div className="aspect-square w-full rounded-xl border border-dashed border-border/60 bg-secondary/20 flex items-center justify-center">
                                <p className="text-xs text-muted-foreground text-center px-4">Натисніть «Генерувати» щоб створити зображення</p>
                            </div>
                        )}
                    </div>

                    {/* Carousel */}
                    <div className="bg-card p-5 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-foreground">Карусель LinkedIn</p>
                                <p className="text-xs text-muted-foreground mt-0.5">5-7 слайдів · PDF</p>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleGenerateCarousel}
                                disabled={generatingCarousel}
                                className="h-8 text-xs gap-1.5 shrink-0"
                            >
                                {generatingCarousel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                {generatingCarousel ? 'Генеруємо...' : 'Генерувати'}
                            </Button>
                        </div>
                        {item.carousel_url ? (
                            <div className="flex flex-col gap-2">
                                <div className="aspect-square w-full rounded-xl border border-border/50 bg-zinc-950/40 flex flex-col items-center justify-center gap-3">
                                    <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                                        <BookOpen className="w-8 h-8 text-indigo-400" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-medium text-foreground">Карусель готова</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">PDF з 5-7 слайдів</p>
                                    </div>
                                </div>
                                <a
                                    href={apiUrl(item.carousel_url)}
                                    download
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-border/60 bg-secondary/50 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                                >
                                    Завантажити PDF
                                </a>
                            </div>
                        ) : (
                            <div className="aspect-square w-full rounded-xl border border-dashed border-border/60 bg-secondary/20 flex items-center justify-center">
                                <p className="text-xs text-muted-foreground text-center px-4">Натисніть «Генерувати» щоб створити карусель зі слайдів</p>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
