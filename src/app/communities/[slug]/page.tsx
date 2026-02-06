'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import PostCard from '@/components/PostCard';
import CreatePostForm from '@/components/CreatePostForm';
import { Community, CommunityMember, Post } from '@/lib/types';

export default function CommunityDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;

  const [community, setCommunity] = useState<Community | null>(null);
  const [membership, setMembership] = useState<CommunityMember | null>(null);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPage, setLoadingPage] = useState(true);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const loadCommunity = useCallback(async () => {
    try {
      const [commRes, postsRes] = await Promise.all([
        fetch(`/api/communities/${slug}`),
        fetch(`/api/communities/${slug}/posts`),
      ]);
      const commData = await commRes.json();
      const postsData = await postsRes.json();

      if (!commRes.ok) {
        router.replace('/communities');
        return;
      }

      setCommunity(commData.community);
      setMembership(commData.membership);
      setMembers(commData.members || []);
      setPosts(postsData.posts || []);
    } catch {
      // ignore
    }
    setLoadingPage(false);
  }, [slug, router]);

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
      loadCommunity();
    }
  }, [user, loading, router, loadCommunity]);

  async function handleJoin() {
    if (!community) return;
    setJoining(true);
    try {
      const res = await fetch(`/api/communities/${community.id}/join`, { method: 'POST' });
      if (res.ok) {
        await loadCommunity();
      }
    } catch {
      // ignore
    }
    setJoining(false);
  }

  async function handleLeave() {
    if (!community) return;
    setLeaving(true);
    try {
      const res = await fetch(`/api/communities/${community.id}/leave`, { method: 'POST' });
      if (res.ok) {
        await loadCommunity();
      }
    } catch {
      // ignore
    }
    setLeaving(false);
  }

  async function reloadPosts() {
    try {
      const res = await fetch(`/api/communities/${slug}/posts`);
      const data = await res.json();
      setPosts(data.posts || []);
    } catch {
      // ignore
    }
  }

  if (loading || loadingPage) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <p className="text-gray-500">Community not found.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Banner */}
      <div
        className="relative h-40 sm:h-52"
        style={{ backgroundColor: community.banner_color }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-6xl px-4 pb-5 sm:px-6">
          <div className="flex items-end gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/90 text-3xl shadow-lg backdrop-blur-sm">
              {community.icon}
            </div>
            <div className="min-w-0 flex-1 pb-0.5">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white drop-shadow-sm">{community.name}</h1>
                {community.is_official ? (
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-indigo-600 backdrop-blur-sm">
                    Official
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-white/80 mt-0.5">
                {community.member_count} {community.member_count === 1 ? 'member' : 'members'} · {community.category}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex gap-8">
          {/* Main Column */}
          <div className="flex-1 min-w-0">
            {/* Join/Leave Bar */}
            {!membership ? (
              <div className="mb-6 rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-gray-900">Join this community</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Become a member to post and interact with others.</p>
                  </div>
                  <button
                    onClick={handleJoin}
                    disabled={joining}
                    className="rounded-xl bg-indigo-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                  >
                    {joining ? 'Joining...' : 'Join Community'}
                  </button>
                </div>
              </div>
            ) : null}

            {/* Create Post (only for members) */}
            {membership && community && (
              <div className="mb-6">
                <CreatePostForm communityId={community.id} onPostCreated={reloadPosts} />
              </div>
            )}

            {/* Posts */}
            {posts.length > 0 ? (
              <div className="space-y-4">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} showCommunity={false} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
                <h3 className="text-base font-semibold text-gray-900">No posts yet</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {membership ? 'Be the first to share something!' : 'Join this community to start the conversation.'}
                </p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="hidden lg:block w-72 shrink-0">
            <div className="sticky top-24 space-y-6">
              {/* About */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">About</h2>
                <p className="text-sm text-gray-600 leading-relaxed">{community.description}</p>

                {community.guidelines && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">Guidelines</h3>
                    <p className="text-xs text-gray-500 leading-relaxed">{community.guidelines}</p>
                  </div>
                )}

                {/* Leave button */}
                {membership && community.creator_id !== user?.id && (
                  <button
                    onClick={handleLeave}
                    disabled={leaving}
                    className="mt-4 w-full rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                  >
                    {leaving ? 'Leaving...' : 'Leave Community'}
                  </button>
                )}
              </div>

              {/* Members */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">
                  Members ({community.member_count})
                </h2>
                <div className="space-y-2">
                  {members.map((member) => (
                    <div key={member.id} className="flex items-center gap-2.5">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-full text-white text-xs font-bold"
                        style={{ backgroundColor: member.avatar_color || '#6366f1' }}
                      >
                        {member.display_name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{member.display_name}</p>
                        <p className="text-xs text-gray-400">@{member.username}</p>
                      </div>
                      {member.role === 'admin' && (
                        <span className="ml-auto text-xs text-indigo-500 font-medium">Admin</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Back link */}
              <Link
                href="/communities"
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
                All Communities
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
