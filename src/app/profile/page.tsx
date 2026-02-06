'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { CommunityWithMembership } from '@/lib/types';

export default function ProfilePage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [communities, setCommunities] = useState<CommunityWithMembership[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);

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
    }
  }, [user, loading, router, loadProfile]);

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

      {/* My Communities */}
      <div className="mt-8">
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

      {/* Account Actions */}
      <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Account</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-gray-700">Email</p>
              <p className="text-sm text-gray-400">{user.email}</p>
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
    </div>
  );
}
