'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Sparkles, PenLine, Trash2, Plus,
  Save, Check, Loader2, FileText,
  User, ShieldAlert, BookOpen, Key, Link2, CheckCircle2, XCircle
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { apiUrl } from '@/lib/api';

interface AuthorProfile {
  name: string;
  expertise: string;
  tone: string;
  about: string;
  avoid_words: string;
  gemini_api_key?: string;
  linkedin_client_id?: string;
  linkedin_client_secret?: string;
  linkedin_access_token?: string;
  linkedin_person_id?: string;
}

interface ExamplePost {
  id: number;
  content: string;
  created_at: string;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<AuthorProfile>({
    name: '', expertise: '', tone: '', about: '', avoid_words: '', gemini_api_key: '',
    linkedin_client_id: '', linkedin_client_secret: '',
  });
  const [examplePosts, setExamplePosts] = useState<ExamplePost[]>([]);
  const [newPost, setNewPost] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [linkedinConnected, setLinkedinConnected] = useState(false);
  const [linkedinConnecting, setLinkedinConnecting] = useState(false);

  useEffect(() => {
    fetch(apiUrl('/api/settings')).then(r => r.json()).then(data => {
      if (data.profile) setProfile(data.profile);
      if (data.examplePosts) setExamplePosts(data.examplePosts);
      setLoading(false);
    });
    fetch(apiUrl('/api/linkedin/status')).then(r => r.json()).then(data => {
      setLinkedinConnected(data.connected);
    }).catch(() => { });

    // Handle OAuth callback params
    const params = new URLSearchParams(window.location.search);
    if (params.get('linkedin_success')) {
      setLinkedinConnected(true);
      window.history.replaceState({}, '', '/settings');
    }
  }, []);

  const handleConnectLinkedIn = async () => {
    setLinkedinConnecting(true);
    try {
      // Save credentials first
      await fetch(apiUrl('/api/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkedin_client_id: profile.linkedin_client_id,
          linkedin_client_secret: profile.linkedin_client_secret,
        }),
      });
      const res = await fetch(apiUrl('/api/linkedin/auth-url'));
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.detail || 'Error');
    } catch {
      alert('Помилка підключення');
    } finally {
      setLinkedinConnecting(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch(apiUrl('/api/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAddPost = async () => {
    if (!newPost.trim()) return;
    const res = await fetch(apiUrl('/api/settings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newPost }),
    });
    if (res.ok) {
      const post = await res.json();
      setExamplePosts(prev => [post, ...prev]);
      setNewPost('');
    }
  };

  const handleDeletePost = async (id: number) => {
    await fetch(apiUrl(`/api/settings?id=${id}`), { method: 'DELETE' });
    setExamplePosts(prev => prev.filter(p => p.id !== id));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground font-medium tracking-wide">Завантаження налаштувань...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Налаштування</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Особистий стиль, тон та приклади контенту</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        {/* Left Column: Profile & Style (spans 7 cols) */}
        <div className="lg:col-span-7 space-y-6 lg:space-y-8">

          {/* Main User Profile Context Card */}
          <div className="relative rounded-[1.5rem] bg-card border border-border/50 p-6 md:p-8 overflow-hidden group transition-all duration-300 hover:border-border/80 hover:shadow-xl hover:shadow-black/10 focus-within:ring-1 focus-within:ring-ring focus-within:border-primary/50">
            {/* Subtle Background Elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none transition-colors duration-500 group-hover:bg-primary/10" />

            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-3 border-b border-border/40 pb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Про вас</h2>
                  <p className="text-sm text-muted-foreground">Розкажіть AI про свій досвід та як ви спілкуєтесь</p>
                </div>
              </div>

              <div>
                <Textarea
                  placeholder={"Хто ви, чим займаєтесь, ваш досвід, як ви спілкуєтесь.\n\nНаприклад: «Я Денис, frontend розробник з 5 років досвіду. Пишу про React, UX та продуктовий підхід. Люблю пояснювати складне простими словами, без зайвого пафосу. Тон — дружній, іноді з гумором.»"}
                  value={profile.about}
                  onChange={(e) => setProfile(prev => ({ ...prev, about: e.target.value }))}
                  rows={6}
                  className="bg-background/40 border-border/80 focus:bg-background resize-none text-base leading-relaxed rounded-xl transition-colors p-4"
                />
                <p className="text-xs text-muted-foreground mt-2 px-1 flex items-center gap-1.5 opacity-80">
                  <Sparkles className="w-3 h-3 text-primary" />
                  Опишіть себе вільно — AI зрозуміє хто ви, ваш тон і стиль
                </p>
              </div>
            </div>
          </div>

          {/* Negative Context Card */}
          <div className="relative rounded-[1.5rem] bg-card border border-border/50 p-6 md:p-8 overflow-hidden group transition-all duration-300 hover:border-destructive/30 hover:shadow-xl hover:shadow-black/10 focus-within:ring-1 focus-within:ring-ring focus-within:border-destructive/50">
            <div className="absolute inset-0 bg-gradient-to-br from-destructive/0 via-transparent to-destructive/[0.02] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-destructive/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none group-hover:bg-destructive/10 transition-colors duration-500" />

            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-3 border-b border-border/40 pb-4">
                <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive shadow-inner">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Чого уникати</h2>
                  <p className="text-sm text-muted-foreground">Слова та фрази, яких AI не повинен вживати</p>
                </div>
              </div>

              <div>
                <Textarea
                  placeholder="інноваційний, синергія, давайте розберемось, уявіть собі, в сучасному світі, трансформація..."
                  value={profile.avoid_words}
                  onChange={(e) => setProfile(prev => ({ ...prev, avoid_words: e.target.value }))}
                  rows={3}
                  className="bg-background/40 border-border/80 focus:bg-background focus-visible:ring-destructive/30 resize-none text-base leading-relaxed rounded-xl transition-colors p-4"
                />
                <p className="text-xs text-muted-foreground mt-2 px-1 opacity-80">
                  Вводьте заборонені слова через кому
                </p>
              </div>
            </div>
          </div>

          {/* AI Settings Card */}
          <div className="relative rounded-[1.5rem] bg-card border border-border/50 p-6 md:p-8 overflow-hidden group transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-black/10">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-transparent to-primary/[0.02] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none group-hover:bg-primary/10 transition-colors duration-500" />

            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-3 border-b border-border/40 pb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Налаштування AI</h2>
                  <p className="text-sm text-muted-foreground">Персональні ключі доступу до моделей</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground px-1">Google Gemini API Key</label>
                  <div className="relative">
                    <Input
                      type="password"
                      placeholder="Введіть ваш API ключ (AI_...)"
                      value={profile.gemini_api_key || ''}
                      onChange={(e) => setProfile(prev => ({ ...prev, gemini_api_key: e.target.value }))}
                      className="bg-background/40 border-border/80 focus:bg-background h-12 rounded-xl transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 px-1 leading-normal">
                    Ваш персональний ключ дозволить AI працювати без затримок. Отримати його можна безкоштовно в <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-primary hover:underline font-semibold">Google AI Studio</a>.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* LinkedIn Integration Card */}
          <div className="relative rounded-[1.5rem] bg-card border border-border/50 p-6 md:p-8 overflow-hidden group transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-black/10 focus-within:ring-1 focus-within:ring-ring focus-within:border-primary/50">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-transparent to-primary/[0.02] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none group-hover:bg-primary/10 transition-colors duration-500" />

            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-3 border-b border-border/40 pb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">LinkedIn</h2>
                  <p className="text-sm text-muted-foreground">Публікуйте пости напряму з додатку</p>
                </div>
                <div className="ml-auto">
                  {linkedinConnected ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Підключено
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 bg-zinc-500/10 border border-zinc-500/20 px-3 py-1.5 rounded-full">
                      <XCircle className="w-3.5 h-3.5" /> Не підключено
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Щоб увімкнути публікацію, створіть безкоштовний додаток на{' '}
                  <a href="https://www.linkedin.com/developers/" target="_blank" className="text-primary hover:underline font-semibold">LinkedIn Developers</a>{' '}
                  і вкажіть Redirect URI: <code className="text-xs bg-zinc-800 px-2 py-0.5 rounded font-mono text-zinc-300">http://localhost:8000/api/linkedin/callback</code>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground px-1">Client ID</label>
                    <Input
                      placeholder="Ваш LinkedIn Client ID"
                      value={profile.linkedin_client_id || ''}
                      onChange={(e) => setProfile(prev => ({ ...prev, linkedin_client_id: e.target.value }))}
                      className="bg-background/40 border-border/80 focus:bg-background h-12 rounded-xl transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground px-1">Client Secret</label>
                    <Input
                      type="password"
                      placeholder="Ваш LinkedIn Client Secret"
                      value={profile.linkedin_client_secret || ''}
                      onChange={(e) => setProfile(prev => ({ ...prev, linkedin_client_secret: e.target.value }))}
                      className="bg-background/40 border-border/80 focus:bg-background h-12 rounded-xl transition-all"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleConnectLinkedIn}
                  disabled={linkedinConnecting || !profile.linkedin_client_id || !profile.linkedin_client_secret}
                  className="h-11 px-6 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-60"
                >
                  {linkedinConnecting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Підключення...</>
                  ) : linkedinConnected ? (
                    <><CheckCircle2 className="w-4 h-4 mr-2" /> Переконнектити LinkedIn</>
                  ) : (
                    <><Link2 className="w-4 h-4 mr-2" /> Підключити LinkedIn</>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Button
              onClick={handleSaveProfile}
              disabled={saving}
              className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 border-0 h-12 px-10 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Збереження...</>
              ) : saved ? (
                <><Check className="w-4 h-4 mr-2" /> Збережено!</>
              ) : (
                <><Save className="w-4 h-4 mr-2" /> Зберегти налаштування профілю</>
              )}
            </Button>
          </div>
        </div>

        {/* Right Column: Examples (spans 5 cols) */}
        <div className="lg:col-span-5 flex flex-col h-full space-y-6 lg:space-y-8">
          <div className="rounded-[1.5rem] bg-card border border-border/40 p-6 md:p-8 flex-1 flex flex-col relative overflow-hidden group">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">Приклади постів</h2>
                <p className="text-sm text-muted-foreground">AI вчитиметься з ваших текстів</p>
              </div>
            </div>

            {/* Add new component */}
            <div className="mb-8 relative z-10">
              <div className="relative">
                <Textarea
                  placeholder="Вставте текст вашого найкращого LinkedIn поста сюди..."
                  value={newPost}
                  onChange={(e) => setNewPost(e.target.value)}
                  rows={4}
                  className="bg-card border-border/80 focus:bg-background resize-none text-sm leading-relaxed rounded-xl transition-colors p-4 pb-14 shadow-sm"
                />
                <Button
                  onClick={handleAddPost}
                  disabled={!newPost.trim()}
                  size="sm"
                  className="absolute bottom-3 right-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium tracking-wide shadow-sm"
                >
                  <Plus className="w-4 h-4 mr-1" /> Додати
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2 px-1">
                Додайте 2-3 приклади, щоб передати ваш унікальний стиль
              </p>
            </div>

            {/* Saved examples list */}
            <div className="space-y-4 flex-1">
              {examplePosts.length > 0 ? (
                examplePosts.map((post, i) => (
                  <div
                    key={post.id}
                    className="group/item relative rounded-2xl border border-border/60 bg-card/80 hover:bg-card hover:border-border hover:shadow-md transition-all p-5"
                  >
                    <div className="flex items-center justify-between mb-3 border-b border-border/30 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-secondary/80 flex items-center justify-center">
                          <FileText className="w-3 h-3 text-muted-foreground group-hover/item:text-foreground transition-colors" />
                        </div>
                        <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                          Приклад {examplePosts.length - i}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="opacity-0 group-hover/item:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1 rounded-md hover:bg-destructive/10"
                        title="Видалити"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-sm text-muted-foreground/90 whitespace-pre-line leading-relaxed line-clamp-4 relative z-10">
                      {post.content}
                    </p>
                  </div>
                ))
              ) : (
                <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center opacity-60 rounded-2xl border border-dashed border-border/50 bg-card/20 p-6">
                  <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center mb-4 text-muted-foreground">
                    <PenLine className="w-5 h-5" />
                  </div>
                  <p className="text-sm text-muted-foreground max-w-[200px]">
                    Немає прикладів. Додайте перший пост вище.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
