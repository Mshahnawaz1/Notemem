import { useEffect, useState, useRef } from 'preact/hooks';
import { useRoute, useLocation } from 'wouter';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { getPad, listPads, updatePad, getHistory, deletePad } from '../lib/api';
import type { PadMeta, Pad, Revision } from '../lib/api';

export default function Room() {
  const [, params] = useRoute('/r/:roomId/:secret');
  const [, paramsWithPad] = useRoute('/r/:roomId/:secret/pads/:padName');
  const [, setLocation] = useLocation();
  
  const roomId = params?.roomId || paramsWithPad?.roomId;
  const secret = params?.secret || paramsWithPad?.secret;
  const activePadName = paramsWithPad?.padName;
  
  const [pads, setPads] = useState<PadMeta[]>([]);
  const [pad, setPad] = useState<Pad | null>(null);
  const [content, setContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<Revision[]>([]);
  const [newPadName, setNewPadName] = useState('');
  
  const pollTimer = useRef<number | null>(null);
  const baseUrl = window.location.origin;

  const fetchPads = async () => {
    if (!roomId || !secret) return;
    try {
      const data = await listPads(roomId, secret);
      setPads(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPad = async (name: string, background = false) => {
    if (!roomId || !secret) return;
    if (!background) setLoading(true);
    try {
      const data = await getPad(roomId, secret, name);
      setPad(data);
      if (!background) setContent(data.content);
      // If we are currently editing and background poll sees a newer version, we might have a conflict!
      // For MVP, we just let the UI know or silently update if not editing.
      if (background && !isEditing) {
        setContent(data.content);
      }
    } catch (e) {
      console.error(e);
      // if 404, maybe pad was deleted
      setPad(null);
      setContent('');
    } finally {
      if (!background) setLoading(false);
    }
  };

  useEffect(() => {
    fetchPads();
    const timer = setInterval(fetchPads, 5000);
    return () => clearInterval(timer);
  }, [roomId, secret]);

  useEffect(() => {
    if (activePadName) {
      fetchPad(activePadName);
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = window.setInterval(() => fetchPad(activePadName, true), 3000);
    } else {
      setPad(null);
      setContent('');
      if (pollTimer.current) clearInterval(pollTimer.current);
    }
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [activePadName, roomId, secret]);

  const handleCreatePad = async (e: Event) => {
    e.preventDefault();
    if (!newPadName || !roomId || !secret) return;
    try {
      setSaving(true);
      await updatePad(roomId, secret, newPadName, '# New Pad', 1);
      setNewPadName('');
      await fetchPads();
      setLocation(`/r/${roomId}/${secret}/pads/${newPadName}`);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!roomId || !secret || !activePadName || !pad) return;
    setSaving(true);
    try {
      await updatePad(roomId, secret, activePadName, content, pad.version);
      setIsEditing(false);
      fetchPad(activePadName);
      fetchPads();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!roomId || !secret || !confirm(`Delete pad ${name}?`)) return;
    await deletePad(roomId, secret, name);
    fetchPads();
    if (activePadName === name) {
      setLocation(`/r/${roomId}/${secret}`);
    }
  };

  const loadHistory = async () => {
    if (!roomId || !secret || !activePadName) return;
    const revs = await getHistory(roomId, secret, activePadName);
    setHistory(revs);
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (historyOpen) loadHistory();
  }, [historyOpen, activePadName]);

  const renderMarkdown = (text: string) => {
    return { __html: DOMPurify.sanitize(marked.parse(text) as string) };
  };

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
          <div>
            <h2 className="font-bold text-xl text-brand">Notemem</h2>
            <div className="text-xs text-zinc-500 mt-1 truncate">Room: {roomId}</div>
          </div>
          <button className="md:hidden text-zinc-500" onClick={() => setSidebarOpen(false)}>×</button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Pads ({pads.length}/20)</h3>
          <ul className="space-y-1">
            {pads.map(p => (
              <li key={p.name} className="flex group">
                <button 
                  className={`flex-1 text-left px-3 py-2 rounded-lg text-sm transition-colors ${activePadName === p.name ? 'bg-brand/10 text-brand font-medium' : 'text-zinc-600 hover:bg-zinc-100'}`}
                  onClick={() => {
                    setLocation(`/r/${roomId}/${secret}/pads/${p.name}`);
                    setSidebarOpen(false);
                  }}
                >
                  {p.name}
                </button>
                <button onClick={() => handleDelete(p.name)} className="hidden group-hover:block px-2 text-red-400 hover:text-red-600">×</button>
              </li>
            ))}
          </ul>
          
          {pads.length < 20 && (
            <form onSubmit={handleCreatePad} className="mt-4">
              <input 
                type="text" 
                placeholder="+ New pad name" 
                value={newPadName}
                onInput={(e) => setNewPadName(e.currentTarget.value)}
                className="w-full text-sm bg-white border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand"
              />
            </form>
          )}
        </div>
        
        <div className="p-4 border-t border-zinc-200 text-xs text-zinc-500 space-y-3 bg-zinc-50">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-medium">Web/Read/Write URL:</span>
              <button 
                onClick={() => navigator.clipboard.writeText(`${baseUrl}/r/${roomId}/${secret}`)}
                className="text-brand hover:text-brand-hover"
              >Copy</button>
            </div>
            <input readOnly value={`${baseUrl}/r/${roomId}/${secret}`} className="w-full bg-zinc-100 p-1.5 rounded-lg mt-1 font-mono text-[10px] border border-zinc-200" onClick={e => (e.target as HTMLInputElement).select()} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="font-medium">MCP Endpoint:</span>
              <button 
                onClick={() => navigator.clipboard.writeText(`${baseUrl}/mcp/${roomId}/${secret}`)}
                className="text-brand hover:text-brand-hover"
              >Copy</button>
            </div>
            <input readOnly value={`${baseUrl}/mcp/${roomId}/${secret}`} className="w-full bg-zinc-100 p-1.5 rounded-lg mt-1 font-mono text-[10px] border border-zinc-200" onClick={e => (e.target as HTMLInputElement).select()} />
          </div>
          <div className="flex items-center justify-between text-orange-500 bg-orange-50 p-2 rounded-lg border border-orange-100">
            <span className="font-medium">Expires in:</span>
            <span>30 days</span>
          </div>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-white">
        {activePadName ? (
          <>
            {/* Header */}
            <div className="h-14 border-b border-zinc-200 flex items-center justify-between px-4 sm:px-6 bg-white shrink-0 shadow-sm z-10 relative">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setSidebarOpen(true)}
                  className="md:hidden text-zinc-500 p-1 -ml-2 rounded-lg hover:bg-zinc-100 transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                </button>
                <h1 className="font-semibold text-lg truncate">{activePadName} <span className="text-xs text-zinc-400 font-normal ml-2">v{pad?.version || 1}</span></h1>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <button 
                  onClick={() => setHistoryOpen(!historyOpen)}
                  className={`text-sm px-2 sm:px-3 py-1.5 rounded-lg transition-colors ${historyOpen ? 'bg-zinc-200 text-zinc-900 shadow-sm' : 'text-zinc-500 hover:bg-zinc-100'}`}
                >
                  History
                </button>
                {isEditing ? (
                  <>
                    <button onClick={() => { setIsEditing(false); setContent(pad?.content || ''); }} className="text-sm px-2 sm:px-3 py-1.5 text-zinc-500 hover:bg-zinc-100 rounded-lg transition-colors">Cancel</button>
                    <button onClick={handleSave} disabled={saving} className="text-sm px-3 sm:px-4 py-1.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-hover shadow-md transition-all disabled:opacity-50">
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </>
                ) : (
                  <button onClick={() => setIsEditing(true)} className="text-sm px-3 sm:px-4 py-1.5 bg-zinc-100 text-zinc-800 font-medium rounded-lg hover:bg-zinc-200 transition-colors">
                    Edit
                  </button>
                )}
              </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 flex overflow-hidden relative">
              <div className="flex-1 overflow-y-auto p-4 sm:p-8">
                <div className="max-w-4xl mx-auto h-full">
                  {loading ? (
                    <div className="animate-pulse flex space-x-4">
                      <div className="flex-1 space-y-4 py-1">
                        <div className="h-4 bg-zinc-200 rounded w-3/4"></div>
                        <div className="space-y-2">
                          <div className="h-4 bg-zinc-200 rounded"></div>
                          <div className="h-4 bg-zinc-200 rounded w-5/6"></div>
                        </div>
                      </div>
                    </div>
                  ) : isEditing ? (
                    <textarea 
                      value={content}
                      onInput={(e) => setContent(e.currentTarget.value)}
                      className="w-full h-full min-h-[500px] resize-none focus:outline-none font-mono text-sm leading-relaxed text-zinc-800 bg-transparent"
                      placeholder="Start typing..."
                    />
                  ) : (
                    <div 
                      className="prose prose-zinc max-w-none font-mono text-sm text-zinc-800"
                      dangerouslySetInnerHTML={renderMarkdown(content)}
                    />
                  )}
                </div>
              </div>
              
              {/* History Sidebar */}
              {historyOpen && (
                <div className="w-80 border-l border-zinc-200 bg-zinc-50/80 backdrop-blur p-4 overflow-y-auto shrink-0 shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.02)] absolute right-0 inset-y-0 z-20">
                  <h3 className="font-semibold text-sm mb-4 text-zinc-800">Revision History</h3>
                  <div className="space-y-4">
                    {history.map(rev => (
                      <div key={rev.version} className="bg-white p-4 rounded-2xl shadow-xl border-0">
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-medium text-sm text-brand bg-brand/10 px-2 py-0.5 rounded-lg">v{rev.version}</span>
                          <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">{new Date(rev.created_at).toLocaleString()}</span>
                        </div>
                        <div className="text-xs font-mono text-zinc-600 line-clamp-3 bg-zinc-50 p-2.5 rounded-lg border border-zinc-100">
                          {rev.content.substring(0, 100) + (rev.content.length > 100 ? '...' : '')}
                        </div>
                        <button 
                          onClick={() => {
                            setContent(rev.content);
                            setIsEditing(true);
                            setHistoryOpen(false);
                          }}
                          className="mt-3 w-full py-2 text-xs bg-zinc-100 text-zinc-700 font-medium hover:bg-zinc-200 rounded-lg transition-colors"
                        >
                          Restore this version
                        </button>
                      </div>
                    ))}
                    {history.length === 0 && <div className="text-sm text-zinc-500 text-center py-8">No history available.</div>}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-400">
            Select or create a pad to get started.
          </div>
        )}
      </div>
    </div>
  );
}
