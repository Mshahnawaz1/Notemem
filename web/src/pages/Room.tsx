import { useCallback, useEffect, useState, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Link, useRoute, useLocation } from 'wouter';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { LogoMark } from '../components/Brand';
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
    info: 'bg-mist/60 border-mist text-ink',
  };
  return (
    <div role={tone === 'info' ? 'status' : 'alert'} className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 border text-sm ${styles[tone]}`}>
      <div className="flex-1">{children}</div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

const bannerButton = 'px-3 py-1 label text-[10px] bg-white border border-current/20 hover:bg-ink/5 transition-colors';

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div>
      <div className="mb-1.5 label text-[10px] text-ink-soft">{label}</div>
      <div className="flex items-center bg-white border border-line overflow-hidden">
        <input readOnly value={value} aria-label={label} className="flex-1 min-w-0 bg-transparent px-2 py-1.5 font-mono text-[10px] text-ink-soft focus:outline-none" onClick={e => e.currentTarget.select()} />
        <button onClick={() => void copy()} className={`shrink-0 w-16 py-1.5 border-l border-line label text-[10px] transition-colors ${copied ? 'bg-brand text-ink' : 'text-ink hover:bg-mist'}`}>{copied ? 'Copied' : 'Copy'}</button>
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
      <div className="min-h-screen ruled flex flex-col items-center justify-center gap-5 px-4 text-center">
        <LogoMark className="w-10 h-10" />
        <h1 className="font-display text-3xl font-semibold tracking-tight">Room unavailable</h1>
        <p className="text-ink-soft max-w-md">{roomError}</p>
        <a href="/" className="btn-primary h-11 px-6">Create a new room</a>
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
    <div className="flex h-screen bg-white text-ink font-sans overflow-hidden">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-ink/20 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-paper border-r border-line flex flex-col transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-line flex items-center justify-between">
          <div className="min-w-0">
            <h2><Link href="/" title="Back to home" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-ink"><LogoMark className="w-5 h-5" />notemem</Link></h2>
            <div className="mt-3 font-mono text-[11px] text-ink-soft truncate">room/{roomId}</div>
            <div className="flex items-center gap-2 mt-1.5 label text-[10px] text-ink-soft">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${live === 'open' ? 'bg-emerald-600' : 'bg-amber-500'}`} />
              {live === 'open' ? 'Live' : 'Reconnecting…'}
              {info && !canWrite && <span className="ml-1 px-1.5 py-0.5 bg-mist text-ink">Read-only</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 self-start">
            <Link href="/" title="Back to home" aria-label="Back to home" className="p-1.5 text-ink-soft hover:text-ink hover:bg-ink/5 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V21h14V9.5"></path></svg>
            </Link>
            <button className="md:hidden p-1.5 text-ink-soft" aria-label="Close pad list" onClick={() => setSidebarOpen(false)}>×</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="label text-[11px] text-ink-faint mb-3">Pads ({pads.length}/{MAX_PADS})</h3>
          <ul className="space-y-1">
            {pads.map(p => (
              <li key={p.name} className="flex group">
                <button
                  className={`flex-1 min-w-0 truncate text-left px-3 py-2 border font-mono text-[13px] transition-colors ${activePadName === p.name ? 'bg-white border-line text-ink font-medium' : 'border-transparent text-ink-soft hover:bg-ink/5'}`}
                  onClick={() => {
                    setLocation(padUrl(p.name));
                    setSidebarOpen(false);
                  }}
                >
                  {p.name}
                </button>
                {canWrite && (
                  <button onClick={() => void handleDelete(p.name)} aria-label={`Delete ${p.name}`} className="hidden group-hover:block px-2 text-ink-faint hover:text-red-700">×</button>
                )}
              </li>
            ))}
          </ul>
          {info && pads.length === 0 && <p className="text-sm text-ink-faint">No pads yet.</p>}

          {canWrite && pads.length < MAX_PADS && (
            <form onSubmit={(e) => void handleCreatePad(e)} className="mt-4">
              <input
                type="text"
                placeholder="+ New pad name"
                value={newPadName}
                disabled={saving}
                onInput={(e) => setNewPadName(e.currentTarget.value)}
                className="field w-full font-mono text-[13px] px-3 py-2"
              />
            </form>
          )}
        </div>

        <div className="p-4 border-t border-line text-xs text-ink-soft space-y-3 bg-paper">
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
              className={`flex items-center justify-between ${remaining < 3 * 86400000 ? 'text-orange-700' : 'text-ink-soft'}`}
            >
              <span className="label text-[10px]">Expires in</span>
              <span className="font-mono">{formatRemaining(remaining)}</span>
            </div>
          )}
          {canWrite && (
            <div className="px-2.5 py-2 bg-amber-50 border border-amber-200 text-[11px] leading-snug text-amber-900">
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
            <div className="h-14 border-b border-line flex items-center justify-between px-4 sm:px-6 bg-white shrink-0 z-10 relative">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open pad list"
                  className="md:hidden text-ink-soft p-1 -ml-2 hover:bg-ink/5 transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                </button>
                <h1 className="font-mono text-[15px] font-medium truncate">
                  {activePadName}
                  {pad && <span className="ml-2 px-1.5 py-0.5 bg-mist text-ink text-[11px]">v{pad.version}</span>}
                </h1>
              </div>
              {padState === 'ready' && (
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    onClick={() => setHistoryOpen(!historyOpen)}
                    className={`btn h-8 px-3 text-xs ${historyOpen ? 'bg-mist border-mist text-ink' : 'border-transparent text-ink-soft hover:text-ink hover:bg-ink/5'}`}
                  >
                    History
                  </button>
                  {canWrite && (editing ? (
                    <>
                      <button onClick={handleCancel} className="btn-quiet h-8 px-3 text-xs">Cancel</button>
                      <button onClick={() => void handleSave()} disabled={saving || remote?.kind === 'deleted'} className="btn-primary h-8 px-4 text-xs">
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => pad && startEditing(pad.content, pad.version)} className="btn-secondary h-8 px-4 text-xs">
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
                        <div className="h-4 bg-mist w-3/4"></div>
                        <div className="space-y-2">
                          <div className="h-4 bg-mist"></div>
                          <div className="h-4 bg-mist w-5/6"></div>
                        </div>
                      </div>
                    </div>
                  ) : editing ? (
                    <>
                      <textarea
                        value={draft}
                        onInput={(e) => setDraft(e.currentTarget.value)}
                        className="w-full flex-1 min-h-[400px] resize-none focus:outline-none font-mono text-sm leading-relaxed text-ink bg-transparent"
                        placeholder="Start typing..."
                      />
                      {remote?.kind === 'newer' && remote.reloaded && (
                        <div className="border border-line">
                          <div className="px-3 py-2 border-b border-line text-xs font-medium text-ink-soft">Latest saved version (v{remote.pad.version})</div>
                          <pre className="p-3 text-xs font-mono text-ink-soft whitespace-pre-wrap max-h-80 overflow-y-auto">{remote.pad.content}</pre>
                        </div>
                      )}
                    </>
                  ) : padState === 'missing' ? (
                    <div className="text-ink-faint text-center py-16">This pad doesn't exist. It may have been deleted.</div>
                  ) : (
                    <div
                      className="pad-prose prose max-w-none font-mono text-sm"
                      dangerouslySetInnerHTML={renderMarkdown(pad?.content ?? '')}
                    />
                  )}
                </div>
              </div>

              {/* History Sidebar */}
              {historyOpen && padState === 'ready' && (
                <div className="w-80 max-w-full border-l border-line bg-paper p-4 overflow-y-auto shrink-0 absolute right-0 inset-y-0 z-20">
                  <h3 className="label text-[11px] text-ink-soft mb-4">Revision history</h3>
                  <div className="space-y-4">
                    {history.map(rev => (
                      <div key={rev.version} className="bg-white border border-line p-4">
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-mono text-xs text-ink bg-mist px-1.5 py-0.5">v{rev.version}</span>
                          <span className="label text-[10px] text-ink-faint">{rev.source} · {new Date(rev.created_at).toLocaleString()}</span>
                        </div>
                        <div className="text-xs font-mono text-ink-soft bg-paper p-2.5 border border-line">
                          <div className="line-clamp-4 whitespace-pre-wrap break-words">{rev.content.substring(0, 160) + (rev.content.length > 160 ? '…' : '')}</div>
                        </div>
                        {canWrite && pad && (
                          <button
                            onClick={() => {
                              startEditing(rev.content, pad.version);
                              setHistoryOpen(false);
                            }}
                            className="btn-secondary mt-3 w-full h-8 text-[11px]"
                          >
                            Restore this version
                          </button>
                        )}
                      </div>
                    ))}
                    {history.length === 0 && <div className="text-sm text-ink-soft text-center py-8">No history available.</div>}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col gap-4 items-center justify-center text-ink-faint px-4 text-center">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden btn-secondary h-9 px-4 text-xs"
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
