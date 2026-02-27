// Hook to detect Electron environment and access native APIs
// Falls back gracefully in browser mode

import { useState, useEffect, useCallback } from 'react';

export function useElectron() {
  const [isElectron, setIsElectron] = useState(false);
  const [platform, setPlatform] = useState('');

  useEffect(() => {
    const hasAPI = typeof window !== 'undefined' && !!window.electronAPI;
    setIsElectron(hasAPI);
    if (hasAPI) {
      window.electronAPI!.getPlatform().then(setPlatform).catch(() => {});
    }
  }, []);

  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;

  return { isElectron, platform, api };
}

export function useSystemInfo() {
  const { api, isElectron } = useElectron();
  const [info, setInfo] = useState<any>(null);

  const refresh = useCallback(async () => {
    if (!api) return;
    const res = await api.getSystemInfo();
    if (res.ok) setInfo(res.data);
  }, [api]);

  useEffect(() => {
    if (isElectron) refresh();
  }, [isElectron, refresh]);

  return { info, refresh };
}

export function useMCP() {
  const { api } = useElectron();
  const [tools, setTools] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(async (config: { command?: string; args?: string[]; env?: Record<string, string> }) => {
    if (!api) return false;
    const res = await api.mcpConnect(config);
    if (res.ok && res.data) {
      setTools(res.data.tools);
      setConnected(true);
      return true;
    }
    return false;
  }, [api]);

  const disconnect = useCallback(async () => {
    if (!api) return;
    await api.mcpDisconnect();
    setTools([]);
    setConnected(false);
  }, [api]);

  const callTool = useCallback(async (name: string, args: Record<string, any>) => {
    if (!api) return null;
    const res = await api.mcpCallTool(name, args);
    return res.ok ? res.data : null;
  }, [api]);

  return { tools, connected, connect, disconnect, callTool };
}
