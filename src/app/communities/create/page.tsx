'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { COMMUNITY_CATEGORIES } from '@/lib/types';

const COMMUNITY_ICONS = ['🌐', '🎨', '💡', '📚', '🎵', '🎮', '💪', '🍳', '🌍', '🤝', '❤️', '🏠', '🎯', '🔬', '✈️', '🐾', '📸', '🧘', '🎭', '🌱'];

export default function CreateCommunityPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: '',
    icon: '🌐',
    guidelines: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login');
    }
    if (!loading && user && !user.is_verified) {
      router.replace('/auth/verify');
    }
  }, [user, loading, router]);

  function updateField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create community.');
        return;
      }

      router.push(`/communities/${data.community.slug}`);
    } catch {
      setError('Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      {/* Back link */}
      <Link
        href="/communities"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back to Communities
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Create a Community</h1>
        <p className="mt-2 text-sm text-gray-500">
          Build a new space around a topic, interest, or cause that doesn&apos;t already exist on Our Space.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="p-6 space-y-6">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Icon Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Community Icon</label>
            <div className="flex flex-wrap gap-2">
              {COMMUNITY_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => updateField('icon', icon)}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg transition-all ${
                    form.icon === icon
                      ? 'bg-indigo-100 ring-2 ring-indigo-500 scale-110'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Community Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="e.g., Photography Enthusiasts"
              maxLength={50}
              required
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <p className="mt-1 text-xs text-gray-400">{form.name.length}/50 characters · Must be unique</p>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
            <select
              value={form.category}
              onChange={(e) => updateField('category', e.target.value)}
              required
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">Select a category</option>
              {COMMUNITY_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="What is this community about? What can members expect?"
              rows={4}
              required
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <p className="mt-1 text-xs text-gray-400">At least 20 characters. Help people understand what this community is for.</p>
          </div>

          {/* Guidelines */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Community Guidelines
              <span className="text-gray-400 font-normal"> (optional)</span>
            </label>
            <textarea
              value={form.guidelines}
              onChange={(e) => updateField('guidelines', e.target.value)}
              placeholder="Set expectations for how members should interact..."
              rows={3}
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 rounded-b-2xl">
          <Link
            href="/communities"
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-2.5 text-sm font-medium text-white shadow-md hover:shadow-lg transition-all disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create Community'}
          </button>
        </div>
      </form>
    </div>
  );
}
