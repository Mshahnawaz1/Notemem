import { useCallback, useEffect, useState, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Link, useRoute, useLocation } from 'wouter';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { ApiError, createPad, getPad, getRoom, updatePad, getHistory, deletePad } from '../lib/api';
import type { Pad, Revision, RoomInfo } from '../lib/api';
import { useRoomEvents } from '../lib/live';

/** A change someone else made to the pad being edited. */
type Remote =
  | { kind: 'newer'; pad: Pad; reloaded: boolean }
  | { kind: 'deleted' };

interface Notice {
  tone: 'error' | 'info';
  text: string;
}

const MAX_PADS = 20;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'any moment';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return plural(Math.max(minutes, 1), 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return plural(hours, 'hour');
  return plural(Math.round(hours / 24), 'day');
}

function Banner({ tone, children, actions }: { tone: 'warning' | 'error' | 'info'; children: ComponentChildren; actions?: ComponentChildren }) {
  const styles = {
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    error: 'bg-red-50 border-red-200 text-red-900',
    info: 'bg-zinc-50 border-zinc-200 text-zinc-800',
  };
  return (
    <div role={tone === 'info' ? 'status' : 'alert'} className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 border rounded-lg text-sm ${styles[tone]}`}>
      <div className="flex-1">{children}</div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

const bannerButton = 'px-3 py-1 rounded-lg text-xs font-medium bg-white border border-current/20 hover:bg-zinc-50 transition-colors';

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div>
      <div className="mb-1 font-medium text-zinc-600">{label}</div>
      <div className="flex items-center bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <input readOnly value={value} aria-label={label} className="flex-1 min-w-0 bg-transparent px-2 py-1.5 font-mono text-[10px] text-zinc-500 focus:outline-none" onClick={e => e.currentTarget.select()} />
        <button onClick={() => void copy()} className="shrink-0 px-2.5 py-1.5 border-l border-zinc-200 text-brand font-medium hover:bg-brand/5 transition-colors">{copied ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  );
}

export default function Room() {
  const [, params] = useRoute('/r/:roomId/:secret');
  const [, paramsWithPad] = useRoute('/r/:roomId/:secret/pads/:padName');
  const [, setLocation] = useLocation();

  const roomId = params?.roomId || paramsWithPad?.roomId;
  const secret = params?.secret || paramsWithPad?.secret;
  const activePadName = paramsWithPad?.padName ? safeDecode(paramsWithPad.padName) : undefined;
  const roomPath = `/r/${roomId}/${secret}`;
  const padUrl = (name: string) => `${roomPath}/pads/${encodeURIComponent(name)}`;

  const [info, setInfo] = useState<RoomInfo | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [pad, setPad] = useState<Pad | null>(null);
  const [padState, setPadState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [remote, setRemote] = useState<Remote | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<Revision[]>([]);
  const [newPadName, setNewPadName] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Read by async callbacks and socket events, which may run after the render that started them.
  const editingRef = useRef(false);
  /** The version the draft was started from; a save sends it as If-Match. */
  const baseVersionRef = useRef(0);
  const savingRef = useRef(false);
  const activePadRef = useRef(activePadName);
  activePadRef.current = activePadName;

  const canWrite = info?.role === 'write';
  const baseUrl = window.location.origin;

  const startEditing = (content: string, version: number) => {
    editingRef.current = true;
    baseVersionRef.current = version;
    setDraft(content);
    setEditing(true);
  };

  const stopEditing = useCallback(() => {
    editingRef.current = false;
    setEditing(false);
    setRemote(null);
  }, []);

  const refreshInfo = useCallback(async () => {
    if (!roomId || !secret) return;
    try {
      setInfo(await getRoom(roomId, secret));
      setRoomError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setRoomError("This link's key doesn't match the room.");
      else if (e instanceof ApiError && e.status === 404) setRoomError(e.message);
      else console.error(e);
    }
  }, [roomId, secret]);

  /** Shows the latest copy of a pad, or, while it is being edited, flags a newer version without touching the draft. */
  const refreshPad = useCallback(async (name: string) => {
    if (!roomId || !secret) return;
    let latest: Pad | null;
    try {
      latest = await getPad(roomId, secret, name);
    } catch (e) {
      setNotice({ tone: 'error', text: errorText(e) });
      return;
    }
    if (activePadRef.current !== name) return;
    if (editingRef.current) {
      if (latest === null) {
        setRemote({ kind: 'deleted' });
      } else if (latest.version > baseVersionRef.current) {
        const newer = latest;
        setRemote(r => (r?.kind === 'newer' && r.pad.version === newer.version ? r : { kind: 'newer', pad: newer, reloaded: false }));
      }
      return;
    }
    setPad(latest);
    setPadState(latest ? 'ready' : 'missing');
  }, [roomId, secret]);

  const live = useRoomEvents(roomId, secret, {
    onEvent: (event) => {
      void refreshInfo();
      // During our own save, the event is for our write; handleSave updates the pad itself.
      if (event.pad === activePadRef.current && !savingRef.current) void refreshPad(event.pad);
    },
    onOpen: () => {
      void refreshInfo();
      if (activePadRef.current) void refreshPad(activePadRef.current);
    },
  });

  useEffect(() => {
    void refreshInfo();
  }, [refreshInfo]);

  useEffect(() => {
    stopEditing();
    setPad(null);
    setNotice(null);
    if (!activePadName) return;
    setPadState('loading');
    void refreshPad(activePadName);
  }, [activePadName, refreshPad, stopEditing]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadHistory = useCallback(async () => {
    if (!roomId || !secret || !activePadName) return;
    try {
      setHistory(await getHistory(roomId, secret, activePadName));
    } catch (e) {
      setNotice({ tone: 'error', text: errorText(e) });
    }
  }, [roomId, secret, activePadName]);

  const padVersion = pad?.version;
  useEffect(() => {
    if (historyOpen) void loadHistory();
  }, [historyOpen, loadHistory, padVersion]);

  const handleCreatePad = async (e: Event) => {
    e.preventDefault();
    const name = newPadName.trim();
    if (!name || !roomId || !secret) return;
    setSaving(true);
    setNotice(null);
    try {
      await createPad(roomId, secret, name, `# ${name}\n`);
      setNewPadName('');
      void refreshInfo();
      setLocation(padUrl(name));
      setSidebarOpen(false);
    } catch (e) {
      setNotice({ tone: 'error', text: errorText(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!roomId || !secret || !activePadName) return;
    const name = activePadName;
    const content = draft;
    setSaving(true);
    savingRef.current = true;
    setNotice(null);
    try {
      const { version } = await updatePad(roomId, secret, name, content, baseVersionRef.current);
      stopEditing();
      setPad({ name, content, version });
      setPadState('ready');
      void refreshInfo();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // The draft stays in the editor; the banner offers to reload the latest version.
        if (e.currentVersion === null) setRemote({ kind: 'deleted' });
        else void refreshPad(name);
      } else {
        setNotice({ tone: 'error', text: errorText(e) });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleRecreate = async () => {
    if (!roomId || !secret || !activePadName) return;
    const name = activePadName;
    const content = draft;
    setSaving(true);
    savingRef.current = true;
    try {
      const { version } = await createPad(roomId, secret, name, content);
      stopEditing();
      setPad({ name, content, version });
      setPadState('ready');
      void refreshInfo();
    } catch (e) {
      setNotice({ tone: 'error', text: errorText(e) });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleCancel = () => {
    stopEditing();
    if (activePadName) void refreshPad(activePadName);
  };

  /** Moves the draft onto the newest version, so the next save replaces it; the draft itself is kept. */
  const reloadLatest = () => {
    if (remote?.kind !== 'newer') return;
    baseVersionRef.current = remote.pad.version;
    setRemote({ ...remote, reloaded: true });
  };

  const discardEdits = () => {
    const latest = remote?.kind === 'newer' ? remote.pad : null;
    stopEditing();
    setPad(latest);
    setPadState(latest ? 'ready' : 'missing');
  };

  const handleDelete = async (name: string) => {
    if (!roomId || !secret || !confirm(`Delete pad ${name}?`)) return;
    try {
      await deletePad(roomId, secret, name);
      void refreshInfo();
      if (activePadName === name) setLocation(roomPath);
    } catch (e) {
      setNotice({ tone: 'error', text: errorText(e) });
    }
  };

  const renderMarkdown = (text: string) => {
    return { __html: DOMPurify.sanitize(marked.parse(text) as string) };
  };

  if (roomError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-bold">Room unavailable</h1>
        <p className="text-zinc-600 max-w-md">{roomError}</p>
        <a href="/" className="bg-brand hover:bg-brand-hover text-white font-medium py-2 px-6 rounded-lg">Create a new room</a>
      </div>
    );
  }

  const pads = info?.pads ?? [];
  const expiresAt = info?.expires_at ? new Date(info.expires_at) : null;
  const remaining = expiresAt ? expiresAt.getTime() - now : null;

  const remoteBanner = editing && remote && (
    remote.kind === 'deleted' ? (
      <Banner
        tone="warning"
        actions={<>
          <button className={bannerButton} disabled={saving} onClick={() => void handleRecreate()}>Recreate with my edits</button>
          <button className={bannerButton} onClick={discardEdits}>Discard my edits</button>
        </>}
      >
        This pad was deleted while you were editing. Your edits are kept.
      </Banner>
    ) : remote.reloaded ? (
      <Banner tone="info" actions={<button className={bannerButton} onClick={discardEdits}>Discard my edits</button>}>
        Version {remote.pad.version} is shown below your editor. Merge it into your edits, then save to replace it.
      </Banner>
    ) : (
      <Banner
        tone="warning"
        actions={<>
          <button className={bannerButton} onClick={reloadLatest}>Reload latest</button>
          <button className={bannerButton} onClick={discardEdits}>Discard my edits</button>
        </>}
      >
        Version {remote.pad.version} was saved while you were editing. Your edits are kept, but saving will fail until you reload the latest version.
      </Banner>
    )
  );

  return (
    <div className="flex h-screen bg-white text-zinc-900 font-sans overflow-hidden">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-zinc-50 border-r border-zinc-200 flex flex-col transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-zinc-200 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="font-bold text-xl text-brand"><Link href="/" title="Back to home" className="hover:text-brand-hover">Notemem</Link></h2>
            <div className="text-xs text-zinc-500 mt-1 truncate">Room: {roomId}</div>
            <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${live === 'open' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              {live === 'open' ? 'Live' : 'Reconnecting...'}
              {info && !canWrite && <span className="ml-1 px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 font-medium">Read-only</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 self-start">
            <Link href="/" title="Back to home" aria-label="Back to home" className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V21h14V9.5"></path></svg>
            </Link>
            <button className="md:hidden p-1.5 text-zinc-500" aria-label="Close pad list" onClick={() => setSidebarOpen(false)}>×</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Pads ({pads.length}/{MAX_PADS})</h3>
          <ul className="space-y-1">
            {pads.map(p => (
              <li key={p.name} className="flex group">
                <button
                  className={`flex-1 min-w-0 truncate text-left px-3 py-2 rounded-lg text-sm transition-colors ${activePadName === p.name ? 'bg-brand/10 text-brand font-medium' : 'text-zinc-600 hover:bg-zinc-100'}`}
                  onClick={() => {
                    setLocation(padUrl(p.name));
                    setSidebarOpen(false);
                  }}
                >
                  {p.name}
                </button>
                {canWrite && (
                  <button onClick={() => void handleDelete(p.name)} aria-label={`Delete ${p.name}`} className="hidden group-hover:block px-2 text-red-400 hover:text-red-600">×</button>
                )}
              </li>
            ))}
          </ul>
          {info && pads.length === 0 && <p className="text-sm text-zinc-400">No pads yet.</p>}

          {canWrite && pads.length < MAX_PADS && (
            <form onSubmit={(e) => void handleCreatePad(e)} className="mt-4">
              <input
                type="text"
                placeholder="+ New pad name"
                value={newPadName}
                disabled={saving}
                onInput={(e) => setNewPadName(e.currentTarget.value)}
                className="w-full text-sm bg-white border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand"
              />
            </form>
          )}
        </div>

        <div className="p-4 border-t border-zinc-200 text-xs text-zinc-500 space-y-3 bg-zinc-50">
          {canWrite ? (
            <>
              <CopyField label="Read/write URL" value={`${baseUrl}${roomPath}`} />
              {info?.read_url && <CopyField label="Read-only URL" value={info.read_url} />}
              <CopyField label="MCP endpoint" value={`${baseUrl}/mcp/${roomId}/${secret}`} />
            </>
          ) : info && (
            <CopyField label="MCP endpoint (read-only)" value={`${baseUrl}/mcp/${roomId}/${secret}`} />
          )}
          {remaining !== null && expiresAt && (
            <div
              title={`Deleted on ${expiresAt.toLocaleString()} unless a pad changes before then. Any change resets it to 30 days.`}
              className={`flex items-center justify-between ${remaining < 3 * 86400000 ? 'text-orange-600' : 'text-zinc-500'}`}
            >
              <span className="font-medium">Expires in</span>
              <span>{formatRemaining(remaining)}</span>
            </div>
          )}
          {canWrite && (
            <div className="px-2.5 py-2 rounded-lg bg-red-50 border border-red-100 text-[11px] leading-snug text-red-700">
              Anyone with the read/write URL can change pads. Keep it private.
            </div>
          )}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-white">
        {activePadName ? (
          <>
            {/* Header */}
            <div className="h-14 border-b border-zinc-200 flex items-center justify-between px-4 sm:px-6 bg-white shrink-0 shadow-sm z-10 relative">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open pad list"
                  className="md:hidden text-zinc-500 p-1 -ml-2 rounded-lg hover:bg-zinc-100 transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                </button>
                <h1 className="font-semibold text-lg truncate">
                  {activePadName}
                  {pad && <span className="text-xs text-zinc-400 font-normal ml-2">v{pad.version}</span>}
                </h1>
              </div>
              {padState === 'ready' && (
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    onClick={() => setHistoryOpen(!historyOpen)}
                    className={`text-sm px-2 sm:px-3 py-1.5 rounded-lg transition-colors ${historyOpen ? 'bg-zinc-200 text-zinc-900 shadow-sm' : 'text-zinc-500 hover:bg-zinc-100'}`}
                  >
                    History
                  </button>
                  {canWrite && (editing ? (
                    <>
                      <button onClick={handleCancel} className="text-sm px-2 sm:px-3 py-1.5 text-zinc-500 hover:bg-zinc-100 rounded-lg transition-colors">Cancel</button>
                      <button onClick={() => void handleSave()} disabled={saving || remote?.kind === 'deleted'} className="text-sm px-3 sm:px-4 py-1.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-hover shadow-md transition-all disabled:opacity-50">
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => pad && startEditing(pad.content, pad.version)} className="text-sm px-3 sm:px-4 py-1.5 bg-zinc-100 text-zinc-800 font-medium rounded-lg hover:bg-zinc-200 transition-colors">
                      Edit
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 flex overflow-hidden relative">
              <div className="flex-1 overflow-y-auto p-4 sm:p-8">
                <div className="max-w-4xl mx-auto h-full flex flex-col gap-4">
                  {notice && (
                    <Banner tone={notice.tone} actions={<button className={bannerButton} onClick={() => setNotice(null)}>Dismiss</button>}>
                      {notice.text}
                    </Banner>
                  )}
                  {remoteBanner}
                  {padState === 'loading' && !editing ? (
                    <div className="animate-pulse flex space-x-4">
                      <div className="flex-1 space-y-4 py-1">
                        <div className="h-4 bg-zinc-200 rounded w-3/4"></div>
                        <div className="space-y-2">
                          <div className="h-4 bg-zinc-200 rounded"></div>
                          <div className="h-4 bg-zinc-200 rounded w-5/6"></div>
                        </div>
                      </div>
                    </div>
                  ) : editing ? (
                    <>
                      <textarea
                        value={draft}
                        onInput={(e) => setDraft(e.currentTarget.value)}
                        className="w-full flex-1 min-h-[400px] resize-none focus:outline-none font-mono text-sm leading-relaxed text-zinc-800 bg-transparent"
                        placeholder="Start typing..."
                      />
                      {remote?.kind === 'newer' && remote.reloaded && (
                        <div className="border border-zinc-200 rounded-lg">
                          <div className="px-3 py-2 border-b border-zinc-200 text-xs font-medium text-zinc-500">Latest saved version (v{remote.pad.version})</div>
                          <pre className="p-3 text-xs font-mono text-zinc-700 whitespace-pre-wrap max-h-80 overflow-y-auto">{remote.pad.content}</pre>
                        </div>
                      )}
                    </>
                  ) : padState === 'missing' ? (
                    <div className="text-zinc-400 text-center py-16">This pad doesn't exist. It may have been deleted.</div>
                  ) : (
                    <div
                      className="prose prose-zinc max-w-none font-mono text-sm text-zinc-800"
                      dangerouslySetInnerHTML={renderMarkdown(pad?.content ?? '')}
                    />
                  )}
                </div>
              </div>

              {/* History Sidebar */}
              {historyOpen && padState === 'ready' && (
                <div className="w-80 max-w-full border-l border-zinc-200 bg-zinc-50/80 backdrop-blur p-4 overflow-y-auto shrink-0 shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.02)] absolute right-0 inset-y-0 z-20">
                  <h3 className="font-semibold text-sm mb-4 text-zinc-800">Revision History</h3>
                  <div className="space-y-4">
                    {history.map(rev => (
                      <div key={rev.version} className="bg-white p-4 rounded-2xl shadow-xl border-0">
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-medium text-sm text-brand bg-brand/10 px-2 py-0.5 rounded-lg">v{rev.version}</span>
                          <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">{rev.source} · {new Date(rev.created_at).toLocaleString()}</span>
                        </div>
                        <div className="text-xs font-mono text-zinc-600 line-clamp-3 bg-zinc-50 p-2.5 rounded-lg border border-zinc-100">
                          {rev.content.substring(0, 100) + (rev.content.length > 100 ? '...' : '')}
                        </div>
                        {canWrite && pad && (
                          <button
                            onClick={() => {
                              startEditing(rev.content, pad.version);
                              setHistoryOpen(false);
                            }}
                            className="mt-3 w-full py-2 text-xs bg-zinc-100 text-zinc-700 font-medium hover:bg-zinc-200 rounded-lg transition-colors"
                          >
                            Restore this version
                          </button>
                        )}
                      </div>
                    ))}
                    {history.length === 0 && <div className="text-sm text-zinc-500 text-center py-8">No history available.</div>}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col gap-4 items-center justify-center text-zinc-400 px-4 text-center">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden text-sm px-3 py-1.5 bg-zinc-100 text-zinc-700 rounded-lg"
            >
              Show pads
            </button>
            {notice && <div className="w-full max-w-md text-left"><Banner tone={notice.tone} actions={<button className={bannerButton} onClick={() => setNotice(null)}>Dismiss</button>}>{notice.text}</Banner></div>}
            {canWrite ? 'Select or create a pad to get started.' : 'Select a pad to read it.'}
          </div>
        )}
      </div>
    </div>
  );
}
