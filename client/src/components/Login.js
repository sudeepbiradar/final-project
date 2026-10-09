import React, { useEffect } from 'react';
import { Mail, Shield, Zap, Sparkles, ArrowRight, Brain, CheckCircle2, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const FEATURES = [
    {
        icon: Brain,
        title: 'AI Classifier Engine',
        desc: 'NVIDIA NIM Llama-3.1 & Naive Bayes multi-model classification across 8 smart categories',
        bg: 'bg-blue-600',
    },
    {
        icon: Zap,
        title: 'Real-Time WebSockets',
        desc: 'Instant push notifications and real-time inbox updates as new messages arrive',
        bg: 'bg-amber-600',
    },
    {
        icon: Shield,
        title: 'IndexedDB Storage',
        desc: 'Persistent local storage with automatic background syncing when online',
        bg: 'bg-emerald-600',
    },
];

const PREVIEW_EMAILS = [
    { from: 'GitHub Security', subject: 'New OAuth sign-in detected from Chrome', cat: 'Security', badge: 'badge-security' },
    { from: 'HDFC Bank', subject: 'Monthly e-Statement for your Account', cat: 'Finance', badge: 'badge-finance' },
    { from: 'VTU Academic', subject: 'Semester examination timetable released', cat: 'College / Student', badge: 'badge-college' },
    { from: 'Sarah Miller', subject: 'Weekend project catchup and sync', cat: 'Personal', badge: 'badge-personal' },
];

const Login = () => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!loading && user) navigate('/dashboard');
    }, [user, loading, navigate]);

    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

    const handleGoogleLogin = () => {
        window.location.href = `${API_URL}/auth/google`;
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between">

            {/* ── Header ── */}
            <header className="w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                        <Mail size={20} />
                    </div>
                    <div>
                        <span className="font-black text-lg text-slate-900 dark:text-slate-100 tracking-tight block leading-none">LiveMail</span>
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">Classifier</span>
                    </div>
                </div>

                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">System Ready • v2.0</span>
                </div>
            </header>

            {/* ── Main Hero Content ── */}
            <main className="w-full max-w-6xl mx-auto px-6 py-6 flex-1 flex flex-col justify-center gap-8">
                
                {/* 2-Column Hero Section */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                    
                    {/* Left Column: Sign-in & Description */}
                    <div className="lg:col-span-7 text-left space-y-5">
                        
                        {/* AI Intelligence Tag */}
                        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-extrabold">
                            <Sparkles size={13} className="text-blue-600 dark:text-blue-400" />
                            <span>Next-Gen AI Email Categorization & Storage</span>
                        </div>

                        {/* Title */}
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 dark:text-slate-100 leading-[1.12]">
                            Intelligent Inbox <br />
                            <span className="text-blue-600 dark:text-blue-400">Real-Time Categorization</span>
                        </h1>

                        {/* Description */}
                        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 font-medium leading-relaxed max-w-xl">
                            Automatically sort incoming emails across <strong className="text-slate-900 dark:text-slate-100">Primary, Personal, Finance, Security & College</strong> categories with 99% NLP precision.
                        </p>

                        {/* Google Sign-In Button */}
                        <div className="pt-2 max-w-md">
                            <button
                                onClick={handleGoogleLogin}
                                className="w-full touch-target flex items-center justify-center gap-3 font-bold py-3.5 px-7 rounded-2xl text-sm text-white bg-blue-600 hover:bg-blue-700 shadow-md transition-colors"
                            >
                                <img
                                    src="https://www.google.com/favicon.ico"
                                    alt="Google"
                                    className="w-5 h-5 bg-white rounded-full p-0.5"
                                />
                                Continue with Google
                                <ArrowRight size={16} />
                            </button>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1.5 font-medium">
                                <Lock size={12} className="text-emerald-500" />
                                Secure Google OAuth2 Login • Read-Only Access
                            </p>
                        </div>
                    </div>

                    {/* Right Column: Live Categorized Mail Preview Card */}
                    <div className="lg:col-span-5 w-full">
                        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-md text-left">
                            
                            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-slate-800">
                                <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />
                                    <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
                                    <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1">Live Mail Inbox</span>
                                </div>
                                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                                    <CheckCircle2 size={11} /> 99% Accuracy
                                </span>
                            </div>

                            <div className="space-y-2.5">
                                {PREVIEW_EMAILS.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{item.from}</span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${item.badge}`}>
                                                    {item.cat}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium truncate">
                                                {item.subject}
                                            </p>
                                        </div>
                                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2.5 py-1 rounded-xl border border-blue-200 dark:border-blue-800 flex-shrink-0">
                                            Classified ✓
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Row: 3 Core Feature Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                    {FEATURES.map((f, i) => {
                        const Icon = f.icon;
                        return (
                            <div
                                key={i}
                                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs transition-all"
                            >
                                <div className={`w-9 h-9 rounded-xl ${f.bg} text-white flex items-center justify-center mb-2.5 shadow-xs`}>
                                    <Icon size={18} />
                                </div>
                                <h3 className="text-xs font-black text-slate-900 dark:text-slate-100 mb-1">{f.title}</h3>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{f.desc}</p>
                            </div>
                        );
                    })}
                </div>
            </main>

            {/* ── Footer ── */}
            <footer className="w-full text-center py-4 text-xs text-slate-400 dark:text-slate-500 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-center gap-2">
                    <Shield size={13} className="text-emerald-600 dark:text-emerald-400" />
                    <span>OAuth2 Encrypted • Persistent IndexedDB Storage • Read-Only Security</span>
                </div>
            </footer>
        </div>
    );
};

export default Login;
