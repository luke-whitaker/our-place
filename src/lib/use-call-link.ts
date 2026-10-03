"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  CALL_LINK_IDLE,
  createCallLink,
  type CallEndReason,
  type CallLink,
  type CallLinkState,
} from "@/lib/call-link";
import { loadMutedMembers } from "@/lib/use-muted-members";

/**
 * The site's one call link, created once and kept for the provider's life,
 * with its state as React state. `onEnd` may change between renders; the
 * link always calls the latest. Coming back to the page checks whether iOS
 * suspended the microphone while it was hidden.
 */
export function useCallLink(onEnd: (callId: string, reason: CallEndReason) => void): {
  link: CallLink;
  state: CallLinkState;
} {
  const [link] = useState(() => createCallLink(loadMutedMembers()));
  const state = useSyncExternalStore(link.subscribe, link.getState, () => CALL_LINK_IDLE);

  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  });
  useEffect(() => link.onEnd((callId, reason) => onEndRef.current(callId, reason)), [link]);

  useEffect(() => {
    function onVisible() {
      if (!document.hidden) link.checkMicAfterReturn();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      // The provider only unmounts when the page itself goes away, or on
      // sign-out; either way the call ends with it.
      void link.leave();
    };
  }, [link]);

  return { link, state };
}
