import { useCallback, useEffect, useState } from 'react';

import { api, errorText, type Pet } from '@/lib/api';

// The live listings (/api/pets, cached by the site for a minute), shared by the
// browse screen and the pet pages so opening a pet needs no second download.
let cache: Pet[] | null = null;
let inflight: Promise<Pet[]> | null = null;
const listeners = new Set<(p: Pet[]) => void>();

export function fetchPets(force = false): Promise<Pet[]> {
  if (cache && !force) return Promise.resolve(cache);
  if (!inflight) {
    inflight = api<{ pets: Pet[] }>('/api/pets')
      .then((r) => {
        cache = r.pets || [];
        listeners.forEach((l) => l(cache!));
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function usePets() {
  const [pets, setPets] = useState<Pet[] | null>(cache);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    listeners.add(setPets);
    fetchPets().catch((e) => setError(errorText(e)));
    return () => {
      listeners.delete(setPets);
    };
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await fetchPets(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { pets, error, refreshing, refresh };
}
