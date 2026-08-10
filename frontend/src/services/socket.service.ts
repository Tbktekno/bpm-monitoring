import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '@/constants';

class SocketService {
  private socket: Socket | null = null;
  private socketAuth: string | null = null;
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();
  private registered: Set<(...args: unknown[]) => void> = new Set();

  connect(token?: string): Socket {
    // Reuse an already-connected socket
    if (this.socket?.connected) {
      // If the auth token changed, rebuild the socket with the new token
      if (token && token !== this.socketAuth) {
        this.socket.removeAllListeners();
        this.socket.disconnect();
        this.socket = null;
        this.socketAuth = null;
      } else {
        return this.socket;
      }
    }

    // Reuse a socket that is still mid-connection. Destroying it here (the old
    // behaviour) on every `connect()` call creates churn: a socket that never
    // finished connecting was torn down, a fresh one started, and the whole
    // cycle repeated — leaving the client eventually connected but with lost
    // listener replays and, critically, realtime events never arriving.
    if (this.socket?.active && token === this.socketAuth) {
      return this.socket;
    }

    // Clean up any previous dead / mismatched socket
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.socketAuth = token ?? null;
    this.socket = io(SOCKET_URL, {
      auth: token ? { token } : undefined,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.attachAllListeners();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
    });

    return this.socket;
  }

  private attachAllListeners(): void {
    if (!this.socket) return;
    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach((cb) => {
        if (!this.registered.has(cb)) {
          this.socket?.on(event, cb);
          this.registered.add(cb);
        }
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.socketAuth = null;
    this.listeners.clear();
    this.registered.clear();
  }

  on(event: string, callback: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    if (this.socket?.connected && !this.registered.has(callback)) {
      this.socket.on(event, callback);
      this.registered.add(callback);
    }
  }

  off(event: string, callback: (...args: unknown[]) => void): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
    }
    if (this.socket) {
      this.socket.off(event, callback);
    }
    this.registered.delete(callback);
  }

  emit(event: string, ...args: unknown[]): void {
    if (this.socket) {
      this.socket.emit(event, ...args);
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const socketService = new SocketService();
