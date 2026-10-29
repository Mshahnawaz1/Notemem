export interface RoomCreated {
  roomId: string;
  readUrl: string;
  writeUrl: string;
}

export type Role = 'read' | 'write';

export interface PadMeta {
  name: string;
  version: number;
  updated_at: string;
}

export interface RoomInfo {
  pads: PadMeta[];
  /** ISO 8601, or null for a room created before expiry was stored. */
  expires_at: string | null;
  role: Role;
  /** Only set for the write key. */
  read_url: string | null;
}

export interface Pad {
  name: string;
  content: string;
  version: number;
}

export interface Revision {
  version: number;
  created_at: string;
  source: 'api' | 'mcp' | 'web';
  content: string;
}

/** One event from the room's live-update socket. */
export interface PadEvent {
  pad: string;
  version: number;
  deleted?: boolean;
}

export interface WriteResult {
  success: boolean;
  version: number;
}

/** A failed request, with the server's error message and, on a 409, the pad's current version. */
export class ApiError extends Error {
  readonly status: number;
  readonly currentVersion?: number | null;

  constructor(message: string, status: number, currentVersion?: number | null) {
    super(message);
    this.status = status;
    this.currentVersion = currentVersion;
  }
}

// Marks writes from the web UI in pad history.
const SOURCE_HEADER = { 'X-Notemem-Source': 'web' };

const roomPath = (roomId: string, secret: string) => `/r/${roomId}/${secret}`;
const padPath = (roomId: string, secret: string, name: string) =>
  `${roomPath(roomId, secret)}/pads/${encodeURIComponent(name)}`;

async function fail(res: Response, fallback: string): Promise<never> {
  let body: { error?: string; currentVersion?: number | null } = {};
  try {
    body = await res.json() as typeof body;
  } catch {
    // Not JSON; use the fallback message.
  }
  throw new ApiError(body.error ?? fallback, res.status, body.currentVersion);
}

/** Reads the version from an `ETag` such as `"3"` or `W/"3"`. */
function etagVersion(res: Response): number {
  const version = Number(res.headers.get('ETag')?.replace(/^W\//, '').replaceAll('"', ''));
  if (!Number.isInteger(version)) throw new ApiError('Response had no version', res.status);
  return version;
}

export const createRoom = async (): Promise<RoomCreated> => {
  const res = await fetch('/api/rooms', { method: 'POST' });
  if (!res.ok) return fail(res, 'Failed to create room');
  return res.json() as Promise<RoomCreated>;
};

export const getRoom = async (roomId: string, secret: string): Promise<RoomInfo> => {
  const res = await fetch(`${roomPath(roomId, secret)}/pads`, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) return fail(res, 'Failed to load the room');
  return res.json() as Promise<RoomInfo>;
};

/** Reads a pad as raw text, the way agents do; the version comes from the ETag. Null if it doesn't exist. */
export const getPad = async (roomId: string, secret: string, name: string): Promise<Pad | null> => {
  const res = await fetch(padPath(roomId, secret, name));
  if (res.status === 404) return null;
  if (!res.ok) return fail(res, 'Failed to load the pad');
  return { name, content: await res.text(), version: etagVersion(res) };
};

const write = async (url: string, init: RequestInit, fallback: string): Promise<WriteResult> => {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SOURCE_HEADER, ...init.headers }
  });
  if (!res.ok) return fail(res, fallback);
  return res.json() as Promise<WriteResult>;
};

/** Replaces a pad only if it is still at `version`; otherwise throws an ApiError with status 409. */
export const updatePad = (roomId: string, secret: string, name: string, content: string, version: number) =>
  write(padPath(roomId, secret, name), {
    method: 'PUT',
    headers: { 'If-Match': `"${version}"` },
    body: content
  }, 'Failed to save the pad');

// Only creates: fails with 412 if a pad with this name already exists.
export const createPad = async (roomId: string, secret: string, name: string, content: string) => {
  try {
    return await write(padPath(roomId, secret, name), {
      method: 'PUT',
      headers: { 'If-None-Match': '*' },
      body: content
    }, 'Failed to create the pad');
  } catch (e) {
    if (e instanceof ApiError && e.status === 412) throw new ApiError(`A pad named "${name}" already exists`, 412);
    throw e;
  }
};

export const appendPad = (roomId: string, secret: string, name: string, text: string) =>
  write(`${padPath(roomId, secret, name)}/append`, { method: 'POST', body: text }, 'Failed to append to the pad');

export const deletePad = async (roomId: string, secret: string, name: string) => {
  const res = await fetch(padPath(roomId, secret, name), {
    method: 'DELETE',
    headers: SOURCE_HEADER
  });
  if (!res.ok) return fail(res, 'Failed to delete the pad');
  return res.json() as Promise<{ success: boolean }>;
};

export const getHistory = async (roomId: string, secret: string, name: string): Promise<Revision[]> => {
  const res = await fetch(`${padPath(roomId, secret, name)}/history`, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) return fail(res, 'Failed to load the history');
  const data = await res.json() as { revisions: Revision[] };
  return data.revisions;
};

/** The WebSocket URL for live updates on the same origin. */
export const eventsUrl = (roomId: string, secret: string) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${roomPath(roomId, secret)}/ws`;
};
