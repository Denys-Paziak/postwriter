'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, apiUrl } from '@/lib/api';
import {
    ArrowLeft,
    ExternalLink,
    RefreshCw,
    Copy,
    Check,
    Loader2,
    Trash2,
    Sparkles,
    Search,
    BookOpen,
    Globe,
    Send,
    FileText,
    Gem,
    MessageSquare,
    Lightbulb,
    Wand2,
    AlignLeft,
    ArrowRight,
    type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';

type PostTone = 'value' | 'story' | 'insight' | 'opinion';

const toneOptions: { key: PostTone; label: string; icon: LucideIcon }[] = [
    { key: 'value',   label: 'Цінність', icon: Gem },
    { key: 'opinion', label: 'Думка',    icon: MessageSquare },
    { key: 'story',   label: 'Історія',  icon: BookOpen },
    { key: 'insight', label: 'Інсайт',   icon: Lightbulb },
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

const wait = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
        let timeoutId = 0;

        const cleanup = () => {
            if (signal) {
                signal.removeEventListener('abort', abort);
            }
        };

        const abort = () => {
            window.clearTimeout(timeoutId);
            cleanup();
            reject(new DOMException('Aborted', 'AbortError'));
        };

        const finish = () => {
            cleanup();
            resolve();
        };

        timeoutId = window.setTimeout(finish, ms);

        if (!signal) return;

        signal.addEventListener('abort', abort, { once: true });
    });

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
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
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
    const searchParams = useSearchParams();
    const rawId = params.id;
    const id = Number(Array.isArray(rawId) ? rawId[0] : rawId);

    const [item, setItem] = useState<ArticleItem | null>(null);
    const [loading, setLoading] = useState(true);

    const [selectedTone, setSelectedTone] = useState<PostTone>('value');
    const [publishing, setPublishing] = useState(false);
    const [contextPanel, setContextPanel] = useState<'none' | 'source' | 'research'>('none');
    const [showRegenerateControls, setShowRegenerateControls] = useState(false);

    const [generating, setGenerating] = useState(false);
    const [generateSteps, setGenerateSteps] = useState<string[]>([]);

    const [researching, setResearching] = useState(false);
    const [, setResearchSteps] = useState<string[]>([]);
    const [doResearch, setDoResearch] = useState(false);

    const [error, setError] = useState<string>('');

    const [editingPost, setEditingPost] = useState<string>('');
    const [isWritingManually, setIsWritingManually] = useState(false);
    const [copied, setCopied] = useState(false);

    const [generatingCarousel, setGeneratingCarousel] = useState(false);
    const [generatingImage, setGeneratingImage] = useState(false);
    const [activeTab, setActiveTab] = useState<'source' | 'research'>('source');

    useEffect(() => {
        setIsWritingManually(searchParams.get('mode') === 'write');
    }, [searchParams]);

    const loadItem = useCallback(async (
        options: { signal?: AbortSignal; silent?: boolean; showToast?: boolean } = {},
    ) => {
        const { signal, silent = false, showToast = true } = options;

        if (!Number.isFinite(id)) {
            setItem(null);
            setEditingPost('');
            setError('Некоректна адреса статті.');
            setLoading(false);
            return false;
        }

        try {
            if (!silent) {
                setLoading(true);
                setItem(null);
                setEditingPost('');
                setGenerating(false);
                setResearching(false);
                setGenerateSteps([]);
                setResearchSteps([]);
                setContextPanel('none');
                setShowRegenerateControls(false);
                setDoResearch(false);
            }
            setError('');

            for (let attempt = 0; attempt < 3; attempt += 1) {
                const res = await apiFetch(`/api/content-plan/${id}`, { signal }, { fresh: true });

                if (res.ok) {
                    const data = await res.json();
                    if (signal?.aborted) return false;

                    setItem(data);
                    setEditingPost(data.generated_post ?? '');
                    setError('');
                    return true;
                }

                if (res.status !== 404 || attempt === 2) {
                    throw new Error('Item not found');
                }

                await wait(250 * (attempt + 1), signal);
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return false;

            setItem(null);
            setEditingPost('');
            setError('Не вдалося завантажити статтю.');

            if (showToast) {
                toast.error('Не вдалося завантажити статтю.');
            }

            return false;
        } finally {
            if (!signal?.aborted) {
                setLoading(false);
            }
        }

        return false;
    }, [id, setResearchSteps]);

    useEffect(() => {
        const controller = new AbortController();
        void loadItem({ signal: controller.signal });
        return () => controller.abort();
    }, [loadItem]);

    const handlePublishLinkedIn = async () => {
        if (!item || !item.generated_post) return;
        setPublishing(true);
        try {
            const res = await fetch(apiUrl(`/api/linkedin/publish/${item.id}`), { method: 'POST' });
            const data = await res.json();
            if (!res.ok) {
                const errMsg = data.detail || 'Помилка публікації';
                if (errMsg.includes('not connected')) {
                    toast.error('LinkedIn не підключено. Перейдіть в Налаштування.');
                } else if (errMsg.includes('expired')) {
                    toast.error('Токен LinkedIn застарів. Переконнектіться в Налаштуваннях.');
                } else {
                    toast.error(errMsg);
                }
                return;
            }
            setItem(data.item);
            toast.success('Пост успішно опубліковано в LinkedIn! 🎉');
        } catch {
            toast.error('Не вдалося опублікувати. Перевірте підключення.');
        } finally {
            setPublishing(false);
        }
    };

    const handleResearch = async () => {
        if (!item) return;
        setResearching(true);
        setResearchSteps([]);
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
                            setContextPanel('research');
                            setResearching(false);
                            setResearchSteps([]);
                            break outer;
                        } else if (payload.type === 'error') {
                            toast.error(payload.message || 'Не вдалося виконати дослідження.');
                            setResearching(false);
                            break outer;
                        }
                    } catch { /* ignore */ }
                }
            }
        } catch {
            toast.error('Не вдалося виконати дослідження.');
        } finally {
            setResearching(false);
        }
    };

    const handleGenerate = async () => {
        if (!item) return;
        setGenerating(true);
        setShowRegenerateControls(false);
        setGenerateSteps([]);

        try {
            // Optional Research Step before Generation
            if (doResearch && !item.research) {
                setGenerateSteps(['Запускаємо дослідження аудиторії...']);
                const resResearch = await fetch(apiUrl('/api/research'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content_plan_id: item.id }),
                });
                if (resResearch.ok && resResearch.body) {
                    const reader = resResearch.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    let researchDone = false;
                    while (!researchDone) {
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
                                    researchDone = true;
                                    break;
                                } else if (payload.type === 'error') {
                                    // If research fails, we just break out and toast, but we can stop generation or proceed.
                                    toast.error(payload.message || 'Не вдалося виконати дослідження.');
                                    researchDone = true;
                                    break;
                                }
                            } catch { /* ignore */ }
                        }
                    }
                }
            }

            setGenerateSteps(prev => [...prev, 'Починаємо генерацію посту...']);

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
                            setGenerating(false);
                            setGenerateSteps([]);
                            break outer;
                        } else if (payload.type === 'error') {
                            toast.error(payload.message || 'Не вдалося згенерувати пост.');
                            setGenerating(false);
                            setGenerateSteps([]);
                            break outer;
                        }
                    } catch { /* ignore */ }
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
            toast.success('Збережено');
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

    // ── Loading / error ───────────────────────────────────────────────────────

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">Завантаження...</p>
        </div>
    );

    if (error && !item) return (
        <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <Trash2 className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-bold mb-2">Помилка</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
                <Button onClick={() => void loadItem({ showToast: false })}>
                    Повторити
                </Button>
                <Button onClick={() => router.push('/content-plan')} variant="outline">
                    Повернутися до плану
                </Button>
            </div>
        </div>
    );

    if (!item) return null;

    const displaySource = (() => {
        try { return new URL(item.url ?? '').hostname.replace('www.', '') || (item.source ?? ''); }
        catch { return item.source ?? ''; }
    })();

    const postChanged = editingPost !== (item.generated_post ?? '');
    const showEditor = editingPost.length > 0 || isWritingManually;

    return (
        <div className="-mx-8 -my-10 lg:-mx-12 flex h-screen overflow-hidden bg-background text-foreground selection:bg-primary/20">

            {/* ══════════════════════════════════════════════════════
                1. WORKSHOP PANEL  flex-1 (PRIMARY)
               ══════════════════════════════════════════════════════ */}
            <div className="flex-1 min-w-0 flex flex-col h-full bg-background relative z-10">

                {/* Top Nav: minimalist, border bottom only */}
                <header className="shrink-0 flex items-center justify-between px-6 h-14 border-b border-border/40 backdrop-blur-md bg-background/80">
                    <div className="flex items-center gap-3 min-w-0">
                        <Button
                            variant="ghost" size="icon"
                            onClick={() => router.push('/content-plan')}
                            className="shrink-0 rounded-md hover:bg-secondary/60 h-8 w-8 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <h1 className="text-[13px] font-semibold tracking-tight text-foreground truncate min-w-0">{item.title}</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        {editingPost && postChanged && (
                            <span className="text-[11px] text-muted-foreground mr-2 animate-pulse hidden sm:inline">Не збережено</span>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleDelete}
                            className="rounded-md h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Видалити"
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                </header>

                {/* Main Scrollable Workspace */}
                <div className="flex-1 min-h-0 overflow-y-auto relative custom-scrollbar pb-24">
                    <div className={`mx-auto px-6 py-10 transition-all duration-300 w-full ${(!showEditor && !generating) ? 'max-w-3xl' : 'max-w-[1200px]'}`}>

                        {!showEditor && !generating ? (
                            <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-xl mx-auto px-4 space-y-8 animate-in fade-in duration-500">
                                <div className="text-center space-y-3">
                                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-secondary/50 border border-border/50 mb-1 shadow-sm">
                                        <Wand2 className="w-6 h-6 text-foreground" />
                                    </div>
                                    <h2 className="text-2xl font-bold tracking-tight text-foreground">Почніть генерацію</h2>
                                    <p className="text-muted-foreground text-sm">Оберіть формат та тон для вашого майбутнього посту</p>
                                </div>

                                <div className="grid grid-cols-2 gap-3 w-full">
                                    {toneOptions.map(tone => {
                                        const isActive = selectedTone === tone.key;
                                        const Icon = tone.icon;
                                        return (
                                            <button
                                                key={tone.key}
                                                onClick={() => setSelectedTone(tone.key)}
                                                className={`flex items-center p-4 rounded-xl border transition-all duration-200 gap-3 group ${
                                                    isActive
                                                        ? 'bg-foreground text-background border-foreground shadow-md scale-[1.02]'
                                                        : 'bg-card/40 border-border/60 text-muted-foreground hover:bg-secondary/60 hover:border-foreground/30 hover:text-foreground'
                                                }`}
                                            >
                                                <div className={`p-2 rounded-lg shrink-0 transition-colors ${isActive ? 'bg-background/20 text-background' : 'bg-secondary group-hover:bg-background text-foreground'}`}>
                                                    <Icon className="w-4 h-4" />
                                                </div>
                                                <span className="font-semibold text-sm">{tone.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Research Toggle */}
                                <div className="w-full">
                                    <div
                                        onClick={() => !item.research && setDoResearch(!doResearch)}
                                        className={`flex items-center justify-between p-4 rounded-xl border transition-all select-none ${
                                            item.research ? 'border-green-500/30 bg-green-500/5 cursor-default' :
                                            doResearch ? 'border-primary/40 bg-primary/5 cursor-pointer shadow-sm hover:bg-primary/10' : 'border-border/60 bg-card/40 cursor-pointer hover:bg-secondary/40'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${item.research ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-secondary text-muted-foreground'}`}>
                                                {item.research ? <Check className="w-4 h-4" /> : <Search className="w-4 h-4" />}
                                            </div>
                                            <div className="flex flex-col text-left">
                                                <span className={`font-semibold text-sm ${item.research ? 'text-green-700 dark:text-green-300' : 'text-foreground'}`}>
                                                    {item.research ? 'Дослідження проведено' : 'Провести дослідження'}
                                                </span>
                                                <span className="text-[11px] text-muted-foreground mt-0.5 max-w-[200px] leading-tight">
                                                    {item.research ? 'Цей пост буде максимально влучним' : 'Допоможе зробити пост влучнішим'}
                                                </span>
                                            </div>
                                        </div>

                                        {!item.research && (
                                            <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 shrink-0 ${doResearch ? 'bg-primary' : 'bg-secondary/60 border border-border'}`}>
                                                <div className={`w-4 h-4 rounded-full bg-background shadow-sm transition-transform ${doResearch ? 'translate-x-4' : 'translate-x-0'}`} />
                                            </div>
                                        )}
                                        {item.research && (
                                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setContextPanel('research'); }} className="h-7 px-2 text-[11px] text-green-700 dark:text-green-300 hover:bg-green-500/20">
                                                Деталі
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col items-center w-full gap-3 pt-2">
                                    <Button
                                        onClick={() => handleGenerate()}
                                        className="h-12 w-full rounded-xl text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                                    >
                                        <Wand2 className="w-4 h-4" />
                                        <span>Згенерувати пост</span>
                                    </Button>
                                    <Button variant="ghost" onClick={() => setIsWritingManually(true)} className="text-muted-foreground hover:text-foreground h-9 px-4 rounded-lg text-xs font-medium transition-colors">
                                        Або почніть писати самостійно
                                    </Button>
                                </div>
                            </div>
                        ) : generating ? (
                            <div className="flex flex-col items-center justify-center py-20">
                                <StepProgress steps={generateSteps} total={7} icon={Sparkles}
                                    title="Створюємо контент..." subtitle="AI аналізує статтю та ваш стиль" />
                            </div>
                        ) : (
                            <>
                                {/* Two Column Layout for Desktop */}
                                <div className="grid grid-cols-1 xl:grid-cols-5 gap-8 w-full">

                                    {/* Left Column: Text Editor */}
                                    <div className="xl:col-span-3 w-full min-w-0">
                                        <div className="mb-6 rounded-2xl border border-border/50 bg-card/40 px-4 py-3 shadow-sm">
                                            <div className="flex flex-col gap-3">
                                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                    <div className="min-w-0 flex-1">
                                                        {showRegenerateControls ? (
                                                            <div className="flex flex-col gap-2">
                                                                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                                                                    Оберіть стиль перегенерації
                                                                </span>
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <div className="flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-border/40 bg-secondary/30 p-1">
                                                                        {toneOptions.map(tone => {
                                                                            const isActive = selectedTone === tone.key;
                                                                            return (
                                                                                <button
                                                                                    key={tone.key}
                                                                                    onClick={() => setSelectedTone(tone.key)}
                                                                                    className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all duration-200 whitespace-nowrap border ${
                                                                                        isActive
                                                                                            ? 'bg-background text-foreground shadow-sm border-border/50'
                                                                                            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                                                                                    }`}
                                                                                >
                                                                                    {tone.label}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>

                                                                    <Button
                                                                        size="sm"
                                                                        onClick={handleGenerate}
                                                                        disabled={generating}
                                                                        className="h-9 px-4 rounded-md bg-foreground hover:bg-foreground/90 text-background font-medium text-[12px] transition-all flex items-center gap-2"
                                                                    >
                                                                        {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                                                                        Згенерувати
                                                                    </Button>

                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={() => setShowRegenerateControls(false)}
                                                                        className="h-9 px-3 text-[12px] text-muted-foreground hover:text-foreground"
                                                                    >
                                                                        Скасувати
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => setShowRegenerateControls(true)}
                                                                className="h-9 px-4 rounded-md bg-foreground hover:bg-foreground/90 text-background font-medium text-[12px] transition-all flex items-center gap-2 w-fit"
                                                            >
                                                                <RefreshCw className="w-3.5 h-3.5" />
                                                                Перегенерувати статтю
                                                            </Button>
                                                        )}
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                                        {editingPost && postChanged && (
                                                            <Button
                                                                size="sm"
                                                                onClick={handleSavePost}
                                                                className="h-9 px-4 text-[12px] font-medium bg-secondary hover:bg-secondary/80 text-foreground rounded-md gap-1.5 transition-all"
                                                            >
                                                                Зберегти
                                                            </Button>
                                                        )}
                                                        {editingPost && (
                                                            <button
                                                                onClick={handleCopy}
                                                                title={copied ? 'Скопійовано' : 'Копіювати'}
                                                                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                                            >
                                                                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                                            </button>
                                                        )}
                                                        {editingPost && (
                                                            <Button
                                                                size="sm"
                                                                onClick={handlePublishLinkedIn}
                                                                disabled={publishing}
                                                                className="h-9 rounded-md bg-[#0A66C2] hover:bg-[#004182] text-white font-medium text-[12px] px-4 gap-2 border-0 transition-all shadow-sm"
                                                            >
                                                                {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                                                LinkedIn
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                                                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider shrink-0">
                                                        {editingPost.length} / 1600
                                                    </span>
                                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                                                        <div
                                                            className="h-full rounded-full bg-foreground transition-all duration-300"
                                                            style={{ width: `${Math.min((editingPost.length / 1600) * 100, 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="group/editor relative bg-background">
                                            {/* Editor guidelines/focus effect */}
                                            <div className="absolute -left-4 top-0 bottom-0 w-[1px] bg-border/40 transition-colors group-focus-within/editor:bg-primary/40 hidden md:block" />

                                            <Textarea
                                                value={editingPost}
                                                onChange={e => setEditingPost(e.target.value)}
                                                className="w-full min-h-[500px] border-0 focus-visible:ring-0 p-0 text-[15px] leading-relaxed bg-transparent resize-none text-foreground placeholder:text-muted-foreground/30 tracking-tight outline-none"
                                                placeholder="Почніть писати ваш пост тут..."
                                            />
                                        </div>
                                    </div>

                                    {/* Right Column: Information & Media Assets Section */}
                                    <div className="xl:col-span-2 w-full xl:sticky xl:top-0 space-y-6 pt-8 xl:pt-0 border-t xl:border-t-0 xl:border-l border-border/30 xl:pl-8">

                                        {/* Context toggle buttons (Desktop) - Moved from Header */}
                                        <div className="mb-6 space-y-3">
                                            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-2">
                                                <AlignLeft className="w-3.5 h-3.5" />
                                                Матеріали
                                            </h3>
                                            <div className="flex flex-col gap-2">
                                                {/* Section 1: Article Accordion */}
                                                <div className="space-y-2">
                                                    <button
                                                        onClick={() => setContextPanel(contextPanel === 'source' ? 'none' : 'source')}
                                                        className={`w-full h-10 px-4 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-between border ${
                                                            contextPanel === 'source'
                                                                ? 'bg-background text-foreground shadow-sm border-border'
                                                                : 'bg-secondary/30 border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50 hover:border-border/50'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <FileText className="w-4 h-4" />
                                                            Оригінал статті
                                                        </div>
                                                        <ArrowRight className={`w-3.5 h-3.5 transition-transform ${contextPanel === 'source' ? 'rotate-90 text-primary' : 'opacity-50'}`} />
                                                    </button>

                                                    {contextPanel === 'source' && (
                                                        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                                            <div className="bg-secondary/20 rounded-xl border border-border/40 p-4 text-[13px] leading-relaxed max-h-[400px] overflow-y-auto custom-scrollbar shadow-inner">
                                                                <div className="flex items-center justify-between text-muted-foreground border-b border-border/20 pb-2 mb-3">
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        <Globe className="w-3 h-3 shrink-0 opacity-70" />
                                                                        <span className="text-[10px] font-semibold uppercase tracking-widest truncate">{displaySource}</span>
                                                                    </div>
                                                                    {item.url && item.url.startsWith('http') && (
                                                                        <a href={item.url} target="_blank" rel="noreferrer"
                                                                           className="shrink-0 p-1 rounded hover:bg-secondary/60 transition-colors">
                                                                            <ExternalLink className="w-3 h-3" />
                                                                        </a>
                                                                    )}
                                                                </div>
                                                                <div className="text-foreground/90 whitespace-pre-wrap font-sans">
                                                                    {item.content || 'Текст статті відсутній.'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Section 2: Research Accordion */}
                                                <div className="space-y-2">
                                                    <button
                                                        onClick={() => setContextPanel(contextPanel === 'research' ? 'none' : 'research')}
                                                        className={`w-full h-10 px-4 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-between border ${
                                                            contextPanel === 'research'
                                                                ? 'bg-background text-foreground shadow-sm border-border'
                                                                : 'bg-secondary/30 border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50 hover:border-border/50'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            {item.research && !researching ? <Check className="w-4 h-4 text-green-500" /> : <Search className="w-4 h-4" />}
                                                            Дослідження аудиторії
                                                        </div>
                                                        <ArrowRight className={`w-3.5 h-3.5 transition-transform ${contextPanel === 'research' ? 'rotate-90 text-primary' : 'opacity-50'}`} />
                                                    </button>

                                                    {contextPanel === 'research' && (
                                                        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                                            <div className="bg-secondary/20 rounded-xl border border-border/40 p-4 text-[13px] leading-relaxed max-h-[400px] overflow-y-auto custom-scrollbar shadow-inner">
                                                                {researching ? (
                                                                    <div className="flex items-center justify-center py-10">
                                                                        <Loader2 className="w-5 h-5 animate-spin text-primary opacity-50" />
                                                                    </div>
                                                                ) : item.research ? (
                                                                    <div className="text-foreground/90 whitespace-pre-wrap font-sans leading-relaxed">
                                                                        {item.research}
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex flex-col items-center justify-center text-center py-6">
                                                                        <p className="text-xs text-muted-foreground mb-4">Дослідження не проведено</p>
                                                                        <Button
                                                                            size="sm"
                                                                            onClick={handleResearch}
                                                                            disabled={researching}
                                                                            className="h-8 text-[11px] font-bold rounded-lg gap-2"
                                                                        >
                                                                            <Search className="w-3.5 h-3.5" /> Провести аналіз
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {item.research && (
                                                                <button
                                                                    onClick={handleResearch}
                                                                    disabled={researching}
                                                                    className="mt-2 w-full h-8 flex items-center justify-center gap-2 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border/60 rounded-lg hover:bg-secondary/30"
                                                                >
                                                                    {researching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                                                    Оновити дослідження
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>


                                        <div className="space-y-6 animate-in fade-in duration-300">
                                            <div className="pt-0">
                                            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                                                <Sparkles className="w-3.5 h-3.5" />
                                                Обкладинка
                                            </h3>
                                        <div className="flex-1 group">
                                            {item.cover_image_url ? (
                                                <div className="relative aspect-video rounded-lg overflow-hidden border border-border/50 bg-secondary/20">
                                                    <img
                                                        src={apiUrl(item.cover_image_url)}
                                                        alt="Cover"
                                                        className="w-full h-full object-cover"
                                                    />
                                                    <div className="absolute inset-0 bg-background/0 group-hover:bg-background/80 backdrop-blur-[2px] transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                        <button
                                                            onClick={handleGenerateImage}
                                                            disabled={generatingImage}
                                                            className="h-8 px-4 rounded-md bg-foreground text-background text-[11px] font-medium flex items-center gap-2 transition-transform hover:scale-105"
                                                        >
                                                            {generatingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                                            Змінити обкладинку
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={handleGenerateImage}
                                                    disabled={generatingImage}
                                                    className="w-full aspect-video flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 hover:border-foreground/30 hover:bg-secondary/20 transition-all text-muted-foreground hover:text-foreground"
                                                >
                                                    {generatingImage ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Sparkles className="w-4 h-4" />
                                                    )}
                                                    <span className="text-[12px] font-medium">
                                                        {generatingImage ? 'Генерація...' : 'Додати обкладинку'}
                                                    </span>
                                                </button>
                                            )}
                                        </div>

                                        {/* Carousel Attachment */}
                                        <div className="flex-1 group">
                                            {item.carousel_url ? (
                                                <div className="w-full aspect-video rounded-lg border border-border/50 bg-secondary/10 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                                                    <BookOpen className="w-8 h-8 text-muted-foreground mb-3 opacity-50" />
                                                    <span className="text-[12px] font-medium text-foreground">Карусель PDF</span>

                                                    <div className="absolute inset-0 bg-background/0 group-hover:bg-background/90 backdrop-blur-[2px] transition-all flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                                        <a
                                                            href={apiUrl(item.carousel_url)}
                                                            download target="_blank" rel="noreferrer"
                                                            className="h-8 px-4 rounded-md bg-foreground text-background text-[11px] font-medium flex items-center gap-2 transition-transform hover:scale-105 w-3/4 justify-center"
                                                        >
                                                            Завантажити
                                                        </a>
                                                        <button
                                                            onClick={handleGenerateCarousel}
                                                            disabled={generatingCarousel}
                                                            className="h-8 px-4 rounded-md bg-secondary text-foreground text-[11px] font-medium flex items-center gap-2 transition-transform hover:scale-105 w-3/4 justify-center"
                                                            title="Перегенерувати"
                                                        >
                                                            {generatingCarousel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                                            Оновити PDF
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={handleGenerateCarousel}
                                                    disabled={generatingCarousel}
                                                    className="w-full aspect-video flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 hover:border-foreground/30 hover:bg-secondary/20 transition-all text-muted-foreground hover:text-foreground"
                                                >
                                                    {generatingCarousel ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <BookOpen className="w-4 h-4" />
                                                    )}
                                                    <span className="text-[12px] font-medium">
                                                        {generatingCarousel ? 'Генерація...' : 'Створити карусель'}
                                                    </span>
                                                </button>
                                            )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════
                2. CONTEXT DRAWER — (Only Mobile / fallback)
               ══════════════════════════════════════════════════════ */}
            {contextPanel !== 'none' && (
                <div className="lg:hidden fixed inset-0 z-[100] bg-background animate-in slide-in-from-bottom duration-300">
                    {/* ... existing mobile context logic could go here if needed ... */}
                </div>
            )}


            {/* ══════════════════════════════════════════════════════
                MOBILE: stacked fallback (shown only on small screens)
               ══════════════════════════════════════════════════════ */}
            <div className="lg:hidden flex-1 overflow-y-auto p-4 space-y-6 bg-background relative z-20 pb-24">
                {/* Mobile: tabs for context */}
                <div className="flex bg-secondary/30 p-1 rounded-lg border border-border/40 w-full mb-6">
                    <button
                        onClick={() => setActiveTab('source')}
                        className={`flex-1 py-1.5 text-[12px] font-medium transition-all duration-200 rounded-md ${
                            activeTab === 'source' ? 'bg-background text-foreground shadow-sm border border-border/50' : 'text-muted-foreground hover:bg-secondary/50'
                        }`}
                    >
                        Стаття
                    </button>
                    <button
                        onClick={() => setActiveTab('research')}
                        className={`flex-1 py-1.5 text-[12px] font-medium transition-all duration-200 rounded-md ${
                            activeTab === 'research' ? 'bg-background text-foreground shadow-sm border border-border/50' : 'text-muted-foreground hover:bg-secondary/50'
                        }`}
                    >
                        Дослідження
                    </button>
                </div>

                {activeTab === 'source' && (
                    <div className="text-foreground/80 text-[13px] leading-relaxed whitespace-pre-line font-sans px-2">
                        {item.content || 'Текст статті відсутній.'}
                    </div>
                )}
                {activeTab === 'research' && (
                    item.research
                        ? <p className="text-foreground/80 text-[13px] leading-relaxed whitespace-pre-line font-sans px-2">{item.research}</p>
                        : <p className="text-muted-foreground text-[13px] text-center py-10 font-medium px-2">Дослідження не проведено</p>
                )}

                <div className="h-px bg-border/40 w-full my-6" />

                {/* Mobile: tone + generate */}
                <div className="mx-2 mt-4 space-y-4">
                    {!showEditor && !generating ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-2">
                                {toneOptions.map(tone => (
                                    <button
                                        key={tone.key}
                                        onClick={() => {
                                            setSelectedTone(tone.key);
                                            if (!generating) {
                                                const p = Promise.resolve();
                                                p.then(() => handleGenerate());
                                            }
                                        }}
                                        className="flex flex-col items-center justify-center p-4 rounded-xl border border-border/40 bg-secondary/20 text-foreground gap-2 transition-all hover:bg-secondary/40 active:scale-95"
                                    >
                                        <Sparkles className="w-5 h-5 opacity-60" />
                                        <span className="text-[12px] font-medium">{tone.label}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="text-center">
                                <Button variant="ghost" onClick={() => setIsWritingManually(true)} className="text-muted-foreground text-xs">
                                    Або почніть писати самостійно
                                </Button>
                            </div>
                        </div>
                    ) : generating ? (
                        <div className="py-12 flex items-center justify-center">
                            <StepProgress steps={generateSteps} total={7} icon={Sparkles}
                                title="Створюємо контент..." subtitle="AI аналізує статтю та ваш стиль" />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {showRegenerateControls ? (
                                <>
                                    <div className="flex bg-secondary/30 p-1 rounded-lg border border-border/40">
                                        {toneOptions.map(tone => (
                                            <button
                                                key={tone.key}
                                                onClick={() => setSelectedTone(tone.key)}
                                                className={`flex-1 py-1.5 text-[11px] font-medium transition-all duration-200 rounded-md ${
                                                    selectedTone === tone.key
                                                        ? 'bg-background text-foreground shadow-sm border border-border/50'
                                                        : 'text-muted-foreground hover:bg-secondary/50'
                                                }`}
                                            >
                                                {tone.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={handleGenerate} disabled={generating}
                                            className="flex-1 h-10 bg-foreground hover:bg-foreground/90 text-background font-medium text-[13px] rounded-md gap-2 transition-all">
                                            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                            Згенерувати
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            onClick={() => setShowRegenerateControls(false)}
                                            className="h-10 px-4 text-[12px] text-muted-foreground"
                                        >
                                            Скасувати
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <Button onClick={() => setShowRegenerateControls(true)}
                                    className="w-full h-10 bg-foreground hover:bg-foreground/90 text-background font-medium text-[13px] rounded-md gap-2 transition-all">
                                    <RefreshCw className="w-4 h-4" />
                                    Перегенерувати статтю
                                </Button>
                            )}

                            <div className="mt-4">
                                <Textarea
                                    value={editingPost}
                                    onChange={e => setEditingPost(e.target.value)}
                                    className="w-full min-h-[300px] border border-border/40 rounded-lg p-4 text-[14px] leading-relaxed bg-secondary/10 resize-none text-foreground focus-visible:ring-1 focus-visible:ring-border/80 outline-none"
                                    placeholder="Напишіть або згенеруйте пост..."
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
