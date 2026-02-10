'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import PostCard from '@/components/PostCard';
import CreatePostForm from '@/components/CreatePostForm';
import { CommunityWithMembership, Post } from '@/lib/types';

type ProfileTab = 'my-place' | 'communities' | 'account';

const TABS: { id: ProfileTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'my-place',
    label: 'My Place',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    id: 'communities',
    label: 'Communities',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
  },
  {
    id: 'account',
    label: 'Account',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
];

export default function ProfilePage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProfileTab>('my-place');
  const [communities, setCommunities] = useState<CommunityWithMembership[]>([]);
  const [myPlacePosts, setMyPlacePosts] = useState<Post[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/communities?joined=true');
      const data = await res.json();
      setCommunities(data.communities || []);
    } catch {
      // ignore
    }
    setLoadingProfile(false);
  }, []);

  const loadMyPlacePosts = useCallback(async () => {
    setLoadingPosts(true);
    try {
      const res = await fetch('/api/my-place/posts');
      const data = await res.json();
      setMyPlacePosts(data.posts || []);
    } catch {
      // ignore
    }
    setLoadingPosts(false);
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
      loadProfile();
      loadMyPlacePosts();
    }
  }, [user, loading, router, loadProfile, loadMyPlacePosts]);

  if (loading || loadingProfile) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Profile Card */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        {/* Banner */}
        <div
          className="h-32"
          style={{ background: `linear-gradient(135deg, ${user.avatar_color}, ${user.avatar_color}88)` }}
        />

        {/* Profile Info */}
        <div className="relative px-6 pb-6">
          <div
            className="-mt-12 flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-white text-white text-3xl font-bold shadow-lg"
            style={{ backgroundColor: user.avatar_color }}
          >
            {user.display_name.charAt(0).toUpperCase()}
          </div>

          <div className="mt-4">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{user.display_name}</h1>
              {user.is_verified ? (
                <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-600">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Verified
                </span>
              ) : null}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">@{user.username}</p>
          </div>

          {/* Stats */}
          <div className="mt-6 flex gap-8">
            <div>
              <p className="text-2xl font-bold text-gray-900">{myPlacePosts.length}</p>
              <p className="text-xs text-gray-500">My Place Posts</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{communities.length}</p>
              <p className="text-xs text-gray-500">Communities</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {user.created_at ? new Date(user.created_at + 'Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}
              </p>
              <p className="text-xs text-gray-500">Member Since</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 rounded-xl bg-gray-100 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── My Place Tab ── */}
      {activeTab === 'my-place' && (
        <div className="mt-6 space-y-6">
          {/* Description */}
          <div className="rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 to-indigo-50 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Welcome to My Place</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Your personal space to share thoughts, photos, and more. Posts here and cross-posts from communities all live here.
                </p>
              </div>
            </div>
          </div>

          {/* Create Post Form */}
          <CreatePostForm onPostCreated={loadMyPlacePosts} />

          {/* Posts */}
          {loadingPosts ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            </div>
          ) : myPlacePosts.length > 0 ? (
            <div className="space-y-4">
              {myPlacePosts.map((post) => (
                <PostCard key={post.id} post={post} showCommunity={true} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
              <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
              <h3 className="mt-3 text-base font-semibold text-gray-900">No posts yet</h3>
              <p className="mt-1 text-sm text-gray-500">
                Share your first post, or use &quot;Also post to My Place&quot; when posting in a community.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Communities Tab ── */}
      {activeTab === 'communities' && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">My Communities</h2>
            <Link href="/communities" className="text-sm text-indigo-600 hover:text-indigo-500">
              Discover more
            </Link>
          </div>

          {communities.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {communities.map((community) => (
                <Link
                  key={community.id}
                  href={`/communities/${community.slug}`}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-all hover:shadow-md hover:-translate-y-0.5"
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-lg"
                    style={{ backgroundColor: community.banner_color + '20' }}
                  >
                    {community.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{community.name}</p>
                    <p className="text-xs text-gray-400">{community.member_count} members</p>
                  </div>
                  {community.role === 'admin' && (
                    <span className="text-xs text-indigo-500 font-medium">Admin</span>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-8 text-center">
              <p className="text-sm text-gray-500">You haven&apos;t joined any communities yet.</p>
              <Link
                href="/communities"
                className="mt-3 inline-flex rounded-lg bg-indigo-500 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-600"
              >
                Browse Communities
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── Account Tab ── */}
      {activeTab === 'account' && (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Account</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-gray-700">Email</p>
                <p className="text-sm text-gray-400">{user.email}</p>
              </div>
            </div>
            <div className="border-t border-gray-100" />
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-gray-700">Username</p>
                <p className="text-sm text-gray-400">@{user.username}</p>
              </div>
            </div>
            <div className="border-t border-gray-100" />
            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
