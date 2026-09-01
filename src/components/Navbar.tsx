"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useState } from "react";

// How long a new member sees the floating "Enter the World" note before it
// becomes hover-only.
const WORLD_HINT_DAYS = 7;

function isNewMember(createdAt?: string) {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created < WORLD_HINT_DAYS * 24 * 60 * 60 * 1000;
}

// The 🍄 next to the logo — the persistent door into the world. New members
// get a floating note so the world can't be missed; after that it only
// appears on hover or focus. In the world itself the mushroom reads as
// "you are here" and drops the note, which would be telling you to go
// somewhere you already are.
function WorldDoor({ createdAt }: { createdAt?: string }) {
  const inWorld = usePathname() === "/world";
  const showHint = !inWorld && isNewMember(createdAt);

  return (
    <div className="group relative">
      <Link
        href="/world"
        aria-label="Enter the World"
        aria-current={inWorld ? "page" : undefined}
        className={`flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-colors hover:bg-surface-emphasis ${
          inWorld ? "bg-surface-emphasis" : ""
        }`}
      >
        <span aria-hidden>🍄</span>
      </Link>
      {!inWorld && (
        <span
          className={`pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-accent-500 px-2.5 py-1 text-xs font-semibold text-ink-inverse shadow-lg ${
            showHint
              ? "animate-bounce"
              : "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          }`}
        >
          Enter the World
        </span>
      )}
    </div>
  );
}

export default function Navbar() {
  const { user, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="op-navbar sticky top-0 z-50 border-b border-line bg-surface/80 backdrop-blur-lg">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo + the mushroom door into the world */}
          <div className="flex items-center gap-1.5">
            <Link href={user?.is_verified ? "/feed" : "/"} className="flex items-center">
              <span className="op-logo text-lg font-bold text-ink tracking-tight">Our Place</span>
            </Link>
            {!loading && user?.is_verified ? <WorldDoor createdAt={user.created_at} /> : null}
          </div>

          {/* Desktop Navigation */}
          {!loading && user?.is_verified ? (
            <div className="hidden sm:flex items-center gap-1">
              <Link
                href="/feed"
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-ink-tertiary transition-colors hover:bg-surface-emphasis hover:text-ink"
              >
                Feed
              </Link>
              <Link
                href="/communities"
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-ink-tertiary transition-colors hover:bg-surface-emphasis hover:text-ink"
              >
                Communities
              </Link>
              <Link
                href="/communities/create"
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-ink-tertiary transition-colors hover:bg-surface-emphasis hover:text-ink"
              >
                Create
              </Link>
            </div>
          ) : null}

          {/* Right Side */}
          <div className="flex items-center gap-3">
            {loading ? (
              <div className="h-8 w-20 animate-pulse rounded-lg bg-surface-emphasis" />
            ) : user ? (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  aria-label="User menu"
                  aria-expanded={menuOpen}
                  className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-surface-emphasis"
                >
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-ink-inverse text-xs font-bold"
                    style={{ backgroundColor: user.avatar_color }}
                  >
                    {user.display_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden sm:block text-sm font-medium text-ink-secondary">
                    {user.display_name.split(" ")[0]}
                  </span>
                  <svg
                    className="h-4 w-4 text-ink-faint"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m19.5 8.25-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                </button>

                {menuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setMenuOpen(false)}
                      aria-hidden="true"
                    />
                    <div
                      role="menu"
                      className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
                    >
                      <div className="border-b border-line-soft px-4 py-3">
                        <p className="text-sm font-semibold text-ink">{user.display_name}</p>
                        <p className="text-xs text-ink-muted">@{user.username}</p>
                      </div>
                      <div className="py-1">
                        <Link
                          href="/profile"
                          onClick={() => setMenuOpen(false)}
                          className="block px-4 py-2.5 text-sm text-ink-secondary hover:bg-surface-muted"
                        >
                          Profile
                        </Link>
                        {user.role === "admin" && (
                          <Link
                            href="/admin"
                            onClick={() => setMenuOpen(false)}
                            className="block px-4 py-2.5 text-sm text-accent-600 hover:bg-accent-50"
                          >
                            Admin
                          </Link>
                        )}
                        <Link
                          href="/feed"
                          onClick={() => setMenuOpen(false)}
                          className="block px-4 py-2.5 text-sm text-ink-secondary hover:bg-surface-muted sm:hidden"
                        >
                          Feed
                        </Link>
                        <Link
                          href="/communities"
                          onClick={() => setMenuOpen(false)}
                          className="block px-4 py-2.5 text-sm text-ink-secondary hover:bg-surface-muted sm:hidden"
                        >
                          Communities
                        </Link>
                        <button
                          onClick={() => {
                            setMenuOpen(false);
                            logout();
                          }}
                          className="block w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                        >
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link
                href="/auth/login"
                className="rounded-lg bg-gradient-to-r from-accent-500 to-purple-600 px-4 py-2 text-sm font-medium text-ink-inverse shadow-md transition-all hover:shadow-lg hover:brightness-110"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
