import { io } from 'socket.io-client';

const getSocketUrl = () => {
    if (process.env.REACT_APP_SOCKET_URL) return process.env.REACT_APP_SOCKET_URL;
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return 'https://livemail-backend.onrender.com';
    }
    return 'http://localhost:5000';
};

const SOCKET_URL = getSocketUrl();

let socketInstance = null;

export const getSocket = () => {
    if (!socketInstance) {
        socketInstance = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            withCredentials: true,
            reconnection: true,
            reconnectionAttempts: 50,
            reconnectionDelay: 2000,
            autoConnect: true,
        });
    }
    return socketInstance;
};

export const disconnectSocket = () => {
    if (socketInstance) {
        socketInstance.disconnect();
        socketInstance = null;
    }
};
