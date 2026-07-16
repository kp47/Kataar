import { io } from 'socket.io-client';
import { API_BASE_URL } from './api/client';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(API_BASE_URL, { withCredentials: true, autoConnect: true });
  }
  return socket;
}
