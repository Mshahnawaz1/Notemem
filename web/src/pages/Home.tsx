import { useState } from 'preact/hooks';
import { useLocation } from 'wouter';
import { createRoom } from '../lib/api';

export default function Home() {
  const [, setLocation] = useLocation();
  const [joinUrl, setJoinUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const { writeUrl } = await createRoom();
      setLocation(new URL(writeUrl).pathname);
    } catch {
      setError('Could not create a room. Please try again.');
      setLoading(false);
    }
  };

  const handleJoin = (e: Event) => {
    e.preventDefault();
    setError(null);
    let path = joinUrl.trim();
    try {
      path = new URL(path).pathname;
    } catch {
      // Not a full URL; it may be just the path.
    }
    if (path.startsWith('/r/')) {
      setLocation(path);
    } else {
      setError('That doesn\'t look like a room URL. It should contain /r/{room}/{key}.');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col items-center pt-24 px-4">
      <div className="max-w-3xl w-full text-center space-y-8">
        <h1 className="text-6xl font-extrabold tracking-tight">
          Zero setup. <span className="text-brand">Agentic memory.</span>
        </h1>
        <p className="text-xl text-zinc-600">
          A free, shared workspace where humans and AI agents read and write the same notes through a private key URL. No accounts. No SDKs.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
          <button 
            onClick={() => void handleCreate()}
            disabled={loading}
            className="bg-brand hover:bg-brand-hover text-white font-semibold py-3 px-8 rounded-2xl shadow-xl transition-all transform hover:scale-105 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create a Room'}
          </button>
          
          <div className="text-zinc-400 font-medium">OR</div>
          
          <form onSubmit={handleJoin} className="flex flex-1 max-w-sm w-full">
            <input 
              type="text" 
              placeholder="Paste Room URL..." 
              value={joinUrl}
              onInput={(e) => setJoinUrl(e.currentTarget.value)}
              className="flex-1 bg-white border border-zinc-200 rounded-l-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
            <button type="submit" className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3 px-6 rounded-r-2xl transition-colors">
              Join
            </button>
          </form>
        </div>

        {error && (
          <div role="alert" className="max-w-xl mx-auto bg-red-50 border border-red-200 text-red-900 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}
      </div>
      
      <div className="grid md:grid-cols-3 gap-8 max-w-5xl w-full mt-32">
        <div className="bg-white p-8 rounded-2xl shadow-xl shadow-zinc-200/50">
          <div className="w-12 h-12 bg-brand/10 text-brand rounded-lg flex items-center justify-center mb-6 text-xl font-bold">1</div>
          <h3 className="text-xl font-bold mb-3">HTTP & MCP</h3>
          <p className="text-zinc-600">Agents can read and write using standard HTTP endpoints or full MCP server integration.</p>
        </div>
        <div className="bg-white p-8 rounded-2xl shadow-xl shadow-zinc-200/50">
          <div className="w-12 h-12 bg-brand/10 text-brand rounded-lg flex items-center justify-center mb-6 text-xl font-bold">2</div>
          <h3 className="text-xl font-bold mb-3">Real-time UI</h3>
          <p className="text-zinc-600">Watch agents update pads in real-time. Restore previous versions with the built-in history timeline.</p>
        </div>
        <div className="bg-white p-8 rounded-2xl shadow-xl shadow-zinc-200/50">
          <div className="w-12 h-12 bg-brand/10 text-brand rounded-lg flex items-center justify-center mb-6 text-xl font-bold">3</div>
          <h3 className="text-xl font-bold mb-3">Safe & Private</h3>
          <p className="text-zinc-600">Separate read and write keys. Automatic 30-day expiry. No key logging. Un-indexed by search engines.</p>
        </div>
      </div>
    </div>
  );
}
