"use client";

import { useEffect, useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { NOTEBOOK_PAGES, NOTE_MAX_CHARS } from "@/lib/items";
import { PAL } from "@/lib/game/constants";
import OverlayPanel from "@/components/OverlayPanel";
import InlineConfirm from "@/components/InlineConfirm";
import OverlayActionButton from "@/components/OverlayActionButton";
import type { NotebookPageDraft } from "@/lib/types";

interface NotebookPanelProps {
  /** Closing the Notebook returns to Pockets, not the world — WorldOverlays
   * decides that; this component only asks to close. */
  onClose: () => void;
}

type ConfirmKind = "tear" | "crumple" | "back";

/** A one-line preview: collapse whitespace so a multi-line draft still reads
 * as one row in the list. */
function preview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return "(blank page)";
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
}

/**
 * <NotebookPanel /> — the list of drafts, and the editor for one of them.
 * Two screens in one component (not two overlay states) because they share
 * so much: the same load, the same draft, the same "did the text change"
 * check that both Tear out and Back need.
 */
export default function NotebookPanel({ onClose }: NotebookPanelProps) {
  const [pages, setPages] = useState<NotebookPageDraft[] | null>(null);
  const [view, setView] = useState<"list" | "editor">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [savedBody, setSavedBody] = useState("");
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function loadPages() {
    apiFetch<{ pages: NotebookPageDraft[] }>("/api/notebook/pages")
      .then((data) => setPages(data.pages))
      .catch((err) => setError(userMessage(err, "Failed to load your notebook.")));
  }
  useEffect(() => {
    loadPages();
    // Only wanted once, on mount; every mutation below reloads explicitly
    // instead of through a dependency that would refire this on every render.
  }, []);

  const dirty = text !== savedBody;

  function openNewPage() {
    setEditingId(null);
    setText("");
    setSavedBody("");
    setNotice("");
    setError("");
    setConfirm(null);
    setView("editor");
  }

  function openExistingPage(page: NotebookPageDraft) {
    setEditingId(page.id);
    setText(page.body);
    setSavedBody(page.body);
    setNotice("");
    setError("");
    setConfirm(null);
    setView("editor");
  }

  function backToList() {
    setView("list");
    setConfirm(null);
    setEditingId(null);
    setText("");
    setSavedBody("");
  }

  /** POST for a new page, PATCH for an existing one. Returns the page's id on
   * success (creating one if this was a new draft), or null having already
   * set `error`. */
  async function savePage(): Promise<string | null> {
    setError("");
    try {
      if (editingId) {
        await apiFetch(`/api/notebook/pages/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        });
        setSavedBody(text);
        return editingId;
      }
      const created = await apiFetch<{ page: NotebookPageDraft }>("/api/notebook/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      setEditingId(created.page.id);
      setSavedBody(text);
      return created.page.id;
    } catch (err) {
      setError(userMessage(err, "Failed to save your draft."));
      return null;
    }
  }

  async function handleSave() {
    setSaving(true);
    const id = await savePage();
    setSaving(false);
    if (id) {
      setNotice("Saved.");
      loadPages();
    }
  }

  async function handleTearOutConfirmed() {
    setConfirm(null);
    setSaving(true);
    // Unsaved edits go with the page it becomes a note from — tear out never
    // silently drops the latest text.
    const id = dirty ? await savePage() : editingId;
    if (!id) {
      setSaving(false);
      return;
    }
    try {
      await apiFetch(`/api/notebook/pages/${id}/tear`, { method: "POST" });
      loadPages();
      backToList();
      setNotice("Torn out. It's in your pockets.");
    } catch (err) {
      setError(userMessage(err, "Failed to tear that out."));
    } finally {
      setSaving(false);
    }
  }

  async function handleCrumpleConfirmed() {
    setConfirm(null);
    // A brand-new, never-saved page has nothing on the server to crumple —
    // discarding it locally is exactly what Back already does.
    if (!editingId) {
      backToList();
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/notebook/pages/${editingId}`, { method: "DELETE" });
      loadPages();
      backToList();
    } catch (err) {
      setError(userMessage(err, "Failed to crumple that draft."));
    } finally {
      setSaving(false);
    }
  }

  function handleBackClick() {
    if (dirty) setConfirm("back");
    else backToList();
  }

  return (
    <OverlayPanel title="Notebook" onClose={onClose}>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {view === "list" && (
        <NotebookList
          pages={pages}
          notice={notice}
          onNewPage={openNewPage}
          onOpenPage={openExistingPage}
        />
      )}
      {view === "editor" && (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={NOTE_MAX_CHARS}
            rows={6}
            placeholder="Write to someone you know..."
            className="w-full resize-none rounded-sm border p-2 text-sm [@media(max-height:480px)]:h-24"
            style={{ borderColor: PAL.textBorder, backgroundColor: PAL.white, color: PAL.darkest }}
          />
          <p className="text-right text-xs" style={{ color: PAL.light }}>
            {text.length} / {NOTE_MAX_CHARS}
          </p>
          {notice && (
            <p className="text-sm" style={{ color: PAL.lightest }}>
              {notice}
            </p>
          )}
          {confirm === "tear" && (
            <InlineConfirm
              message="Tear out this page? It becomes a note in your pockets and can't be edited again."
              onConfirm={handleTearOutConfirmed}
              onCancel={() => setConfirm(null)}
            />
          )}
          {confirm === "crumple" && (
            <InlineConfirm
              message="Crumple this page up? It's gone for good."
              onConfirm={handleCrumpleConfirmed}
              onCancel={() => setConfirm(null)}
            />
          )}
          {confirm === "back" && (
            <InlineConfirm
              message="Discard your changes?"
              onConfirm={backToList}
              onCancel={() => setConfirm(null)}
            />
          )}
          {!confirm && (
            <div className="flex flex-wrap gap-2">
              <OverlayActionButton onClick={handleSave} disabled={saving || !dirty}>
                Save
              </OverlayActionButton>
              <OverlayActionButton onClick={() => setConfirm("tear")} disabled={saving}>
                Tear out
              </OverlayActionButton>
              {editingId && (
                <OverlayActionButton
                  onClick={() => setConfirm("crumple")}
                  disabled={saving}
                  variant="secondary"
                >
                  Crumple up
                </OverlayActionButton>
              )}
              <OverlayActionButton onClick={handleBackClick} disabled={saving} variant="secondary">
                Back
              </OverlayActionButton>
            </div>
          )}
        </div>
      )}
    </OverlayPanel>
  );
}

interface NotebookListProps {
  pages: NotebookPageDraft[] | null;
  notice: string;
  onNewPage: () => void;
  onOpenPage: (page: NotebookPageDraft) => void;
}

function NotebookList({ pages, notice, onNewPage, onOpenPage }: NotebookListProps) {
  if (!pages) {
    return (
      <p className="text-sm" style={{ color: PAL.light }}>
        Loading...
      </p>
    );
  }
  const full = pages.length >= NOTEBOOK_PAGES;
  return (
    <>
      {notice && (
        <p className="text-sm" style={{ color: PAL.lightest }}>
          {notice}
        </p>
      )}
      <p className="text-sm" style={{ color: PAL.light }}>
        {pages.length} of {NOTEBOOK_PAGES} drafts
      </p>
      <div className="flex flex-col gap-1">
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => onOpenPage(page)}
            className="min-h-11 touch-manipulation truncate rounded-sm border px-2 py-1 text-left text-sm"
            style={{ borderColor: PAL.textBorder, color: PAL.white }}
          >
            {preview(page.body)}
          </button>
        ))}
      </div>
      <OverlayActionButton onClick={onNewPage} disabled={full}>
        New page
      </OverlayActionButton>
      {full && (
        <p className="text-xs" style={{ color: PAL.light }}>
          Tear one out or crumple one up to make room.
        </p>
      )}
    </>
  );
}
