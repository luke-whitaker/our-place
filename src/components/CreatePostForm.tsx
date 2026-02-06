'use client';

import { useState } from 'react';

export default function CreatePostForm({
  communityId,
  onPostCreated,
}: {
  communityId: string;
  onPostCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/communities/${communityId}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create post.');
        return;
      }
      setTitle('');
      setContent('');
      setOpen(false);
      onPostCreated();
    } catch {
      setError('Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border-2 border-dashed border-gray-200 bg-white p-5 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/30"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <span className="text-sm font-medium text-gray-500">Share something with the community...</span>
        </div>
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Create a Post</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>
        )}

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give your post a title"
          maxLength={200}
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What would you like to share?"
          rows={4}
          className="mt-3 w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim() || !content.trim() || loading}
          className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
        >
          {loading ? 'Posting...' : 'Post'}
        </button>
      </div>
    </form>
  );
}
