"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { useState } from "react";

export default function Navbar() {
  const { user, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-lg">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href={user?.is_verified ? "/feed" : "/"} className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-sm font-bold shadow-md">
              OP
            </div>
            <span className="text-lg font-bold text-gray-900 tracking-tight">Our Place</span>
          </Link>

          {/* Desktop Navigation */}
          {!loading && user?.is_verified ? (
            <div className="hidden sm:flex items-center gap-1">
              <Link
                href="/feed"
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                Feed
              </Link>
              <Link
                href="/communities"
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                Communities
              </Link>
              <Link
                href="/communities/create"
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                Create
              </Link>
            </div>
          ) : null}

          {/* Right Side */}
          <div className="flex items-center gap-3">
            {loading ? (
              <div className="h-8 w-20 animate-pulse rounded-lg bg-gray-100" />
            ) : user ? (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-gray-100"
                >
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-white text-xs font-bold"
                    style={{ backgroundColor: user.avatar_color }}
                  >
                    {user.display_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden sm:block text-sm font-medium text-gray-700">
                    {user.display_name.split(" ")[0]}
                  </span>
                  <svg
                    className="h-4 w-4 text-gray-400"
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
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                      <div className="border-b border-gray-100 px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900">{user.display_name}</p>
                        <p className="text-xs text-gray-500">@{user.username}</p>
                      </div>
                      <div className="py-1">
                        <Link
                          href="/profile"
                          onClick={() => setMenuOpen(false)}
                          className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Profile
                        </Link>
                        <Link
                          href="/feed"
                          onClick={() => setMenuOpen(false)}
                          className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 sm:hidden"
                        >
                          Feed
                        </Link>
                        <Link
                          href="/communities"
                          onClick={() => setMenuOpen(false)}
                          className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 sm:hidden"
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
              <div className="flex items-center gap-2">
                <Link
                  href="/auth/login"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/register"
                  className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-all hover:shadow-lg hover:brightness-110"
                >
                  Join Our Place
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
