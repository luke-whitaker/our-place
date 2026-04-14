"use client";

import Link from "next/link";
import { CommunityWithMembership } from "@/lib/types";

export default function CommunityCard({ community }: { community: CommunityWithMembership }) {
  return (
    <Link
      href={`/communities/${community.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition-all hover:shadow-lg hover:-translate-y-0.5"
    >
      {/* Banner */}
      <div
        className="relative h-24 flex items-end p-4"
        style={{ backgroundColor: community.banner_color }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
        <span className="relative text-3xl drop-shadow-lg">{community.icon}</span>
        {community.is_official ? (
          <span className="absolute top-3 right-3 rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-indigo-600 shadow-sm">
            Official
          </span>
        ) : null}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-base font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
          {community.name}
        </h3>
        <p className="mt-1 flex-1 text-sm text-gray-500 line-clamp-2 leading-relaxed">
          {community.description}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
              />
            </svg>
            <span>
              {community.member_count} {community.member_count === 1 ? "member" : "members"}
            </span>
          </div>
          {community.is_member ? (
            <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-600">
              Joined
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
              View
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
