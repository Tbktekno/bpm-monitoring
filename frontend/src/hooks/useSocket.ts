import { useEffect, useRef, useCallback } from 'react';
import { socketService } from '@/services/socket.service';
import { useAuthContext } from '@/contexts/AuthContext';

export function useSocket() {
  const { token } = useAuthContext();
  const isConnected = useRef(false);

  useEffect(() => {
    if (token && !isConnected.current) {
      socketService.connect(token);
      isConnected.current = true;
    }

    return () => {
      // Don't disconnect on unmount - keep connection alive
    };
  }, [token]);

  const on = useCallback((event: string, callback: (...args: unknown[]) => void) => {
    socketService.on(event, callback);
    return () => socketService.off(event, callback);
  }, []);

  const emit = useCallback((event: string, ...args: unknown[]) => {
    socketService.emit(event, ...args);
  }, []);

  return { on, emit, isConnected: socketService.isConnected() };
}
