'use client';

import { useState, useEffect, useCallback, useRef, Dispatch } from 'react';
import { GardenState, GardenAction } from '../types';

interface User { id: string; username: string }

export function useCloudSync(state: GardenState, dispatch: Dispatch<GardenAction>) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const justLoadedRef = useRef(false);

  // Check if already logged in on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (d.user) setUser(d.user); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Cloud garden is loaded manually via "Load Saved" on the welcome screen,
  // not automatically on login — so the user can choose new vs. saved.

  // Auto-save to cloud on state changes (debounced 800ms)
  useEffect(() => {
    if (!user) return;
    if (state.screen !== 'planner') return;
    if (justLoadedRef.current) { justLoadedRef.current = false; return; }
    const t = setTimeout(() => {
      fetch('/api/garden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [state, user]);

  const login = useCallback(async (username: string, password: string): Promise<string | null> => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) return data.error || 'Login failed.';
    setUser({ id: data.userId, username });
    return null;
  }, []);

  const register = useCallback(async (username: string, password: string): Promise<string | null> => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) return data.error || 'Registration failed.';
    setUser({ id: data.userId, username });
    return null;
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    try { localStorage.removeItem('pixel-garden-planner-v2'); } catch {}
    setUser(null);
    dispatch({ type: 'RESET' });
  }, [dispatch]);

  return { user, loading, login, register, logout };
}
