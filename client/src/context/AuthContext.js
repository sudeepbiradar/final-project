import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { disconnectSocket } from '../services/socket';

const AuthContext = createContext();

const getApiBaseUrl = () => {
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'https://livemail-backend.onrender.com';
  }
  return 'http://localhost:5000';
};

const API_BASE = getApiBaseUrl();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);
  const [isGoogleConnected, setIsGoogleConnected] = useState(true);

  const checkAuthStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE}/user`, { withCredentials: true });
      if (res.data?.user) {
        setUser(res.data.user);
        setIsGoogleConnected(true);
        localStorage.setItem('user', JSON.stringify(res.data.user));
      } else {
        setIsGoogleConnected(false);
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setIsGoogleConnected(false);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token');
    const userFromUrl = params.get('user');

    if (tokenFromUrl) {
      localStorage.setItem('token', tokenFromUrl);
      if (userFromUrl) {
        try {
          const parsed = JSON.parse(decodeURIComponent(userFromUrl));
          localStorage.setItem('user', JSON.stringify(parsed));
          setUser(parsed);
          setIsGoogleConnected(true);
        } catch (e) {}
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    
    checkAuthStatus();
  }, []);

  const logout = async () => {
    try {
      disconnectSocket();
      await axios.get(`${API_BASE}/logout`, { withCredentials: true }).catch(() => {});
      await axios.post(`${API_BASE}/logout`, {}, { withCredentials: true }).catch(() => {});
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      // Keep local IndexedDB cached emails preserved for offline viewing

      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.clear();
      delete axios.defaults.headers.common['Authorization'];
      setUser(null);
      setIsGoogleConnected(false);
      window.location.href = '/';
    }
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, isAuthenticated: !!user, isGoogleConnected, checkAuthStatus, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
