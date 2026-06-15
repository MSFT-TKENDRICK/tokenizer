import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createLiveClient, type LiveClient } from "./liveClient";
import { ENGINE_STATUS, type EngineStatus, type LiveModelInfo, type LiveStatus, type LiveUsage } from "./protocol";

export interface LiveTurnState {
  text: string;
  status: "streaming" | "done" | "error";
  usage?: LiveUsage;
  error?: string;
}

export interface UseLiveChat {
  probed: boolean;
  available: boolean;
  authenticated: boolean;
  login?: string;
  engineStatus: EngineStatus;
  models: LiveModelInfo[];
  modelIds: Set<string>;
  liveResponses: Map<number, LiveTurnState>;
  liveVersion: number;
  streamingTurn: number | null;
  isStreaming: boolean;
  refreshStatus: () => Promise<void>;
  send: (turnIndex: number, conversationId: string, model: string, message: string) => Promise<void>;
  abort: () => void;
  clear: () => void;
  subscribeStream: (listener: () => void) => () => void;
  getStreamVersion: () => number;
  readStream: (turnIndex: number) => string;
}

function liveBaseUrl(): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/+$/, "")}/copilot/live`;
}

export function useLiveChat(): UseLiveChat {
  const clientRef = useRef<LiveClient | null>(null);
  if (clientRef.current === null) {
    clientRef.current = createLiveClient(liveBaseUrl());
  }

  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [liveResponses, setLiveResponses] = useState<Map<number, LiveTurnState>>(new Map());
  const [liveVersion, setLiveVersion] = useState(0);
  const [streamingTurn, setStreamingTurn] = useState<number | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  // rAF-coalesced live stream buffer. Kept out of React state so per-delta
  // updates never re-render App; only <LiveMessageStream> subscribes.
  const streamRef = useRef<{ turn: number | null; text: string }>({ turn: null, text: "" });
  const versionRef = useRef(0);
  const listenersRef = useRef(new Set<() => void>());
  const rafRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    versionRef.current += 1;
    for (const listener of listenersRef.current) listener();
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(flush)
        : (setTimeout(flush, 16) as unknown as number);
  }, [flush]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (rafRef.current != null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      const next = await client.getStatus();
      setStatus(next);
    } catch {
      setStatus({ available: false, authenticated: false, engineStatus: ENGINE_STATUS.unavailable, models: [] });
    }
  }, []);

  // Self-drive the warm-up poll until the engine is ready or unavailable.
  useEffect(() => {
    if (status?.engineStatus !== ENGINE_STATUS.warming) return;
    const timer = setTimeout(() => {
      void refreshStatus();
    }, 1200);
    return () => clearTimeout(timer);
  }, [status, refreshStatus]);

  const send = useCallback(
    async (turnIndex: number, conversationId: string, model: string, message: string) => {
      const client = clientRef.current;
      if (!client) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      streamRef.current = { turn: turnIndex, text: "" };
      scheduleFlush();
      setStreamingTurn(turnIndex);
      setIsStreaming(true);
      setLiveResponses((prev) => new Map(prev).set(turnIndex, { text: "", status: "streaming" }));

      let finalText: string | null = null;
      let usage: LiveUsage | undefined;
      let errorMessage: string | undefined;

      try {
        await client.streamChat(
          { conversationId, model, message, signal: controller.signal },
          {
            onDelta: (delta) => {
              if (streamRef.current.turn !== turnIndex) return;
              streamRef.current = { turn: turnIndex, text: streamRef.current.text + delta };
              scheduleFlush();
            },
            onUsage: (next) => {
              usage = next;
            },
            onMessage: (text) => {
              finalText = text;
            },
            onError: (msg) => {
              errorMessage = msg;
            },
          },
        );
        const committed = finalText ?? streamRef.current.text;
        setLiveResponses((prev) =>
          new Map(prev).set(turnIndex, {
            text: committed,
            status: errorMessage ? "error" : "done",
            usage,
            error: errorMessage,
          }),
        );
        setLiveVersion((value) => value + 1);
      } catch (error) {
        if (!controller.signal.aborted) {
          setLiveResponses((prev) =>
            new Map(prev).set(turnIndex, {
              text: streamRef.current.text,
              status: "error",
              error: error instanceof Error ? error.message : String(error),
            }),
          );
          setLiveVersion((value) => value + 1);
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        streamRef.current = { turn: null, text: "" };
        scheduleFlush();
        setStreamingTurn(null);
        setIsStreaming(false);
      }
    },
    [scheduleFlush],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    streamRef.current = { turn: null, text: "" };
    scheduleFlush();
    setLiveResponses(new Map());
    setLiveVersion((value) => value + 1);
    setStreamingTurn(null);
    setIsStreaming(false);
  }, [scheduleFlush]);

  const subscribeStream = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getStreamVersion = useCallback(() => versionRef.current, []);

  const readStream = useCallback(
    (turnIndex: number) => (streamRef.current.turn === turnIndex ? streamRef.current.text : ""),
    [],
  );

  const modelIds = useMemo(() => new Set((status?.models ?? []).map((model) => model.id)), [status]);

  return {
    probed: status !== null,
    available: status?.available ?? false,
    authenticated: status?.authenticated ?? false,
    login: status?.login,
    engineStatus: status?.engineStatus ?? ENGINE_STATUS.unavailable,
    models: status?.models ?? [],
    modelIds,
    liveResponses,
    liveVersion,
    streamingTurn,
    isStreaming,
    refreshStatus,
    send,
    abort,
    clear,
    subscribeStream,
    getStreamVersion,
    readStream,
  };
}
