"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import PostCard from "@/components/PostCard";
import FriendActionButton from "@/components/FriendActionButton";
import type { FriendshipStatus, Post, PublicProfile } from "@/lib/types";

interface FriendshipInfo {
  status: FriendshipStatus;
  id: string | null;
}

// Someone else's My Place. Everyone sees the header card (banner, avatar,
// counts, member since); posts are friends-only — enforced by the API, this
// page just mirrors it.
export default function PublicProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const username = params.username as string;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [friendship, setFriendship] = useState<FriendshipInfo>({ status: "none", id: null });
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch(`/api/users/${username}`);
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      const data = await res.json();
      setProfile(data.user);
      setFriendship(data.friendship);

      if (data.friendship.status === "friends") {
        const postsRes = await fetch(`/api/users/${username}/posts`);
        if (postsRes.ok) {
          const postsData = await postsRes.json();
          setPosts(postsData.posts || []);
        }
      } else {
        setPosts([]);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoadingProfile(false);
    }
  }, [username]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    // Your own place lives at /profile, with editing and account settings.
    if (user.username === username.toLowerCase()) {
      router.replace("/profile");
      return;
    }
    void (async () => {
      await loadProfile();
    })();
  }, [user, loading, username, router, loadProfile]);

  if (loading || loadingProfile) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-accent-500 border-t-transparent" />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-xl font-semibold text-ink">This person doesn&apos;t exist.</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Check the username, or head back to your feed.
        </p>
      </div>
    );
  }

  const isFriend = friendship.status === "friends";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Profile Card — same chrome as /profile, minus the private tabs */}
      <div className="op-card overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div
          className="h-32"
          style={{
            background: `linear-gradient(135deg, ${profile.avatar_color}, ${profile.avatar_color}88)`,
          }}
        />

        <div className="relative px-6 pb-6">
          <div className="flex items-start justify-between">
            <div
              className="-mt-12 flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-white text-ink-inverse text-3xl font-bold shadow-lg"
              style={{ backgroundColor: profile.avatar_color }}
            >
              {profile.display_name.charAt(0).toUpperCase()}
            </div>
            <div className="mt-4">
              <FriendActionButton
                status={friendship.status}
                friendshipId={friendship.id}
                username={profile.username}
                displayName={profile.display_name}
                onChanged={loadProfile}
              />
            </div>
          </div>

          <div className="mt-4">
            <h1 className="text-2xl font-bold text-ink">{profile.display_name}</h1>
            <p className="text-sm text-ink-muted mt-0.5">@{profile.username}</p>
          </div>

          <div className="mt-6 flex gap-8">
            <div>
              <p className="text-2xl font-bold text-ink">{profile.my_place_post_count}</p>
              <p className="text-xs text-ink-muted">My Place Posts</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">{profile.community_count}</p>
              <p className="text-xs text-ink-muted">Communities</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">
                {new Date(profile.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </p>
              <p className="text-xs text-ink-muted">Member Since</p>
            </div>
          </div>
        </div>
      </div>

      {/* Posts — friends only */}
      <div className="mt-6">
        {isFriend ? (
          posts.length > 0 ? (
            <div className="space-y-4">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} showCommunity={true} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-line bg-surface p-10 text-center">
              <h3 className="text-base font-semibold text-ink">No posts yet</h3>
              <p className="mt-1 text-sm text-ink-muted">
                {profile.display_name} hasn&apos;t posted to their place.
              </p>
            </div>
          )
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-line bg-surface p-10 text-center">
            <svg
              className="mx-auto h-10 w-10 text-ink-disabled"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
            <h3 className="mt-3 text-base font-semibold text-ink">Posts are for friends</h3>
            <p className="mt-1 text-sm text-ink-muted">
              {friendship.status === "pending_outgoing"
                ? `Your friend request is waiting for ${profile.display_name}.`
                : friendship.status === "pending_incoming"
                  ? `${profile.display_name} sent you a friend request — accept it to see their posts.`
                  : `Become friends with ${profile.display_name} to see what they share here.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
