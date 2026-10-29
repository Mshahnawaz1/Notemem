export interface RoomCreated {
  roomId: string;
  readUrl: string;
  writeUrl: string;
}

export interface PadMeta {
  name: string;
  version: number;
  updated_at: string;
}

export interface Pad {
  name: string;
  content: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Revision {
  version: number;
  created_at: string;
  source: 'api' | 'mcp' | 'web';
  content: string;
}

// Marks writes from the web UI in pad history.
const SOURCE_HEADER = { 'X-Notemem-Source': 'web' };

export interface WriteResult {
  success: boolean;
  version: number;
}

export const createRoom = async (): Promise<RoomCreated> => {
  const res = await fetch('/api/rooms', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create room');
  return res.json() as Promise<RoomCreated>;
};

export const listPads = async (roomId: string, secret: string): Promise<PadMeta[]> => {
  const res = await fetch(`/r/${roomId}/${secret}/pads`, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error('Failed to list pads');
  const data = await res.json() as { pads: PadMeta[] };
  return data.pads;
};

export const getPad = async (roomId: string, secret: string, name: string): Promise<Pad> => {
  const res = await fetch(`/r/${roomId}/${secret}/pads/${name}`, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error('Failed to fetch pad');
  return res.json() as Promise<Pad>;
};

export const updatePad = async (roomId: string, secret: string, name: string, content: string, version: number) => {
  const res = await fetch(`/r/${roomId}/${secret}/pads/${name}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': version.toString(),
      ...SOURCE_HEADER
    },
    body: JSON.stringify({ content })
  });
  if (!res.ok) {
    if (res.status === 409) throw new Error('Conflict');
    throw new Error('Failed to update pad');
  }
  return res.json() as Promise<WriteResult>;
};

export const appendPad = async (roomId: string, secret: string, name: string, text: string) => {
  const res = await fetch(`/r/${roomId}/${secret}/pads/${name}/append`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...SOURCE_HEADER
    },
    body: JSON.stringify({ text })
  });
  if (!res.ok) throw new Error('Failed to append pad');
  return res.json() as Promise<WriteResult>;
};

export const deletePad = async (roomId: string, secret: string, name: string) => {
  const res = await fetch(`/r/${roomId}/${secret}/pads/${name}`, {
    method: 'DELETE',
    headers: SOURCE_HEADER
  });
  if (!res.ok) throw new Error('Failed to delete pad');
  return res.json() as Promise<{ success: boolean }>;
};

export const getHistory = async (roomId: string, secret: string, name: string): Promise<Revision[]> => {
  const res = await fetch(`/r/${roomId}/${secret}/pads/${name}/history`, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error('Failed to fetch history');
  const data = await res.json() as { revisions: Revision[] };
  return data.revisions;
};
