import { useCallback, useEffect, useRef, useState } from 'react';

const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:8000';

export const useWebSocket = (eventoId) => {
  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  const connect = useCallback(() => {
    if (!eventoId) return;

    try {
      const ws = new WebSocket(`${WS_URL}/ws/attendance/${eventoId}`);

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, 5000);
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setMessages((prev) => [data, ...prev].slice(0, 50));
        } catch {}
      };
      ws.onerror = () => ws.close();

      wsRef.current = ws;
    } catch (e) {
      console.error('WebSocket error:', e);
    }
  }, [eventoId]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { messages, connected };
};
