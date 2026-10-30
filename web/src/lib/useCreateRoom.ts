import { useState } from 'preact/hooks';
import { useLocation } from 'wouter';
import { createRoom } from './api';

/** Creates a room and opens it with the write key. */
export function useCreateRoom() {
  const [, setLocation] = useLocation();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const { writeUrl } = await createRoom();
      setLocation(new URL(writeUrl).pathname);
    } catch {
      setError('Could not create a room. Please try again.');
      setCreating(false);
    }
  };

  return { create, creating, error, setError };
}
