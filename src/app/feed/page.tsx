'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import PostCard from '@/components/PostCard';
import { Post, CommunityWithMembership } from '@/lib/types';

export default function FeedPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [communities, setCommunities] = useState<CommunityWithMembership[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);

  const loadFeed = useCallback(async () => {
    try {
      const [feedRes, commRes] = await Promise.all([
        fetch('/api/feed'),
        fetch('/api/communities?joined=true'),
      ]);
      const feedData = await feedRes.json();
      const commData = await commRes.json();
      setPosts(feedData.posts || []);
      setCommunities(commData.communities || []);
    } catch {
      // ignore
    }
    setLoadingFeed(false);
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login');
      return;
    }
    if (!loading && user && !user.is_verified) {
      router.replace('/auth/verify');
      return;
    }
    if (!loading && user?.is_verified) {
      loadFeed();
    }
  }, [user, loading, router, loadFeed]);

  if (loading || loadingFeed) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex gap-8">
        {/* Main Feed */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Your Feed</h1>
              <p className="text-sm text-gray-500 mt-1">Posts from your communities</p>
            </div>
          </div>

          {posts.length > 0 ? (
            <div className="space-y-4">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 mb-5">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Your feed is empty</h3>
              <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
                Join some communities to see posts in your feed. Start by exploring what&apos;s available!
              </p>
              <Link
                href="/communities"
                className="mt-5 inline-flex rounded-xl bg-indigo-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-600"
              >
                Browse Communities
              </Link>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="hidden lg:block w-72 shrink-0">
          <div className="sticky top-24 space-y-6">
            {/* My Communities */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900">My Communities</h2>
                <Link href="/communities" className="text-xs text-indigo-600 hover:text-indigo-500">
                  View all
                </Link>
              </div>

              {communities.length > 0 ? (
                <div className="space-y-1">
                  {communities.slice(0, 8).map((community) => (
                    <Link
                      key={community.id}
                      href={`/communities/${community.slug}`}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-gray-50"
                    >
                      <span className="text-lg">{community.icon}</span>
                      <span className="text-sm font-medium text-gray-700 truncate">{community.name}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No communities joined yet.</p>
              )}

              <Link
                href="/communities"
                className="mt-3 block rounded-xl bg-gray-50 py-2 text-center text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                Discover More
              </Link>
            </div>

            {/* Quick Create */}
            <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-indigo-50 to-purple-50 p-5">
              <h2 className="text-sm font-semibold text-gray-900">Start Something New</h2>
              <p className="mt-1 text-xs text-gray-500">Can&apos;t find your community?</p>
              <Link
                href="/communities/create"
                className="mt-3 block rounded-xl bg-white px-4 py-2 text-center text-sm font-medium text-indigo-600 shadow-sm hover:shadow-md transition-shadow"
              >
                Create a Community
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
