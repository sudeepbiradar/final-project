import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import DOMPurify from 'dompurify';
import {
    Mail, Send, Inbox, Shield, Briefcase,
    PieChart, Settings, LogOut, Search,
    Plus, X, ChevronRight, User, Filter,
    Star, AlertCircle, GraduationCap, Plane, Heart, Tag, Folder,
    Clock, RefreshCw, Zap, TrendingUp, Bell, Brain,
    ChevronDown, MoreHorizontal, Trash2, Archive,
    Reply, Forward, ExternalLink, CheckCircle2,
    CalendarDays, ListChecks, AlarmClock, MapPin, Sparkles,
    Wifi, WifiOff, Paperclip, Check, Volume2, VolumeX, Play,
    Undo, RotateCcw, HardDrive, Users, CheckSquare, SlidersHorizontal,
    ArrowDownUp, ShieldCheck, Database, Sun, Moon, Menu
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../services/socket';
import {
    getCachedEmails,
    getCachedEmailById,
    saveEmailsToCache,
    saveEmailToCache,
    updateCachedEmail,
    deleteCachedEmail,
    searchCachedEmails,
    enqueuePendingAction,
    flushPendingActions,
    isEmailNotifiedLocal,
    recordEmailNotifiedLocal,
    saveUserCorrectionLocal,
    getUserCorrectionsLocal,
    removeUserCorrectionLocal,
    pruneCache,
    getStorageUsageEstimate,
    exportEmailsToJSON,
    wipeAllLocalData
} from '../services/db';

const getSocketUrl = () => {
    if (process.env.REACT_APP_SOCKET_URL) return process.env.REACT_APP_SOCKET_URL;
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return 'https://livemail-backend.onrender.com';
    }
    return 'http://localhost:5000';
};

const SOCKET_URL = getSocketUrl();

export const FOLDERS = [
    { id: 'inbox',     name: 'Inbox',     icon: Inbox,     badgeClass: 'text-blue-600 bg-blue-50' },
    { id: 'starred',   name: 'Starred',   icon: Star,      badgeClass: 'text-amber-600 bg-amber-50' },
    { id: 'important', name: 'Important', icon: Sparkles,  badgeClass: 'text-indigo-600 bg-indigo-50' },
    { id: 'archived',  name: 'Archived',  icon: Archive,   badgeClass: 'text-slate-600 bg-slate-100' },
    { id: 'trash',     name: 'Trash',     icon: Trash2,    badgeClass: 'text-rose-600 bg-rose-50' },
];

export const CATEGORIES = [
    { name: 'All',                   icon: Inbox,         badge: 'badge-default',    dot: '#3b82f6', accent: '#3b82f6' },
    { name: 'Primary',               icon: Sparkles,      badge: 'badge-default',    dot: '#6366f1', accent: '#6366f1' },
    { name: 'Promotions',            icon: Tag,           badge: 'badge-promotions', dot: '#ec4899', accent: '#ec4899' },
    { name: 'Spam',                  icon: AlertCircle,   badge: 'badge-spam',       dot: '#f43f5e', accent: '#f43f5e' },
    { name: 'Personal',              icon: User,          badge: 'badge-personal',   dot: '#10b981', accent: '#10b981' },
    { name: 'Finance',               icon: PieChart,      badge: 'badge-finance',    dot: '#059669', accent: '#059669' },
    { name: 'College / Student',     icon: GraduationCap, badge: 'badge-college',    dot: '#06b6d4', accent: '#06b6d4' },
    { name: 'Security',              icon: Shield,        badge: 'badge-security',   dot: '#ef4444', accent: '#ef4444' },
    { name: 'Other / Uncategorized', icon: Folder,        badge: 'badge-default',    dot: '#6b7280', accent: '#6b7280' },
];

export const getCategoryConfig = (name) =>
    CATEGORIES.find(c => c.name === name) || CATEGORIES[CATEGORIES.length - 1];

export const normalizeCategory = (cat) => {
    if (!cat) return 'Primary';
    const t = cat.toString().trim().toLowerCase();
    
    if (t === 'inbox' || t === 'all') return 'All';
    if (t.includes('promo') || t.includes('deal') || t.includes('discount') || t.includes('sale') || t.includes('coupon')) return 'Promotions';
    if (t.includes('security') || t.includes('password') || t.includes('otp') || t.includes('login') || t.includes('auth') || t.includes('verification')) return 'Security';
    if (t.includes('finance') || t.includes('bank') || t.includes('payment') || t.includes('transaction') || t.includes('invoice') || t.includes('bill') || t.includes('salary')) return 'Finance';
    if (t.includes('college') || t.includes('student') || t.includes('school') || t.includes('exam') || t.includes('education') || t.includes('semester') || t.includes('academic')) return 'College / Student';
    if (t.includes('personal') || t.includes('friend') || t.includes('family') || t.includes('dinner') || t.includes('birthday')) return 'Personal';
    if (t.includes('spam') || t.includes('junk') || t.includes('lottery') || t.includes('jackpot') || t.includes('winner')) return 'Spam';
    if (t.includes('business') || t.includes('work') || t.includes('primary') || t.includes('client') || t.includes('project')) return 'Primary';
    if (t.includes('other') || t.includes('uncategorized') || t.includes('uncategorised')) return 'Other / Uncategorized';
    
    return 'Other / Uncategorized';
};

const formatTime = (ts) => {
    if (!ts) return 'just now';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return 'just now';
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/* ── Shared Audio Context (Web Audio API singleton) ────────────── */
let sharedAudioCtx = null;
const getSharedAudioContext = () => {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
            sharedAudioCtx = new AudioCtx();
        }
        if (sharedAudioCtx.state === 'suspended') {
            sharedAudioCtx.resume().catch(() => {});
        }
        return sharedAudioCtx;
    } catch (_) {
        return null;
    }
};

/* ── Helper utilities for avatars & calendar ───────────────────── */
const getSenderInitials = (fromStr) => {
    if (!fromStr) return '?';
    const namePart = fromStr.split('<')[0].trim();
    if (!namePart) return '?';
    const parts = namePart.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    }
    return namePart[0].toUpperCase();
};

const getSenderColor = (fromStr) => {
    if (!fromStr) return '#6366f1';
    let hash = 0;
    for (let i = 0; i < fromStr.length; i++) {
        hash = fromStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return `hsl(${h}, 70%, 55%)`;
};

const isEmailHighPriority = (email) => {
    if (!email) return false;
    return !!(
        email.isImportant ||
        email.priority === 'IMPORTANT' ||
        email.priority === 'URGENT' ||
        email.category === 'Security' ||
        email.category === 'Finance'
    );
};

const isCalendarMail = (email) => {
    if (!email) return false;
    const hasMeetingReminder = email.reminders?.some(r => r.type === 'meeting');
    const hasDateReminder = email.reminders?.some(r => r.type === 'date');
    const inviteRegex = /\b(meeting|call|invite|invitation|zoom|google meet|teams|calendar|scheduled|schedule|agenda)\b/i;
    const matchesKeywords = inviteRegex.test(email.subject || '') || inviteRegex.test(email.snippet || '');
    return hasMeetingReminder || (hasDateReminder && matchesKeywords);
};

/* ── Skeleton loading card ──────────────────────────────────────── */
const SkeletonCard = ({ i }) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: i * 0.05 }}
        className="rounded-2xl p-4 bg-slate-50 border border-slate-200 animate-pulse flex items-center gap-4"
        style={{ height: 80 }}
    >
        <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0" />
        <div className="flex-1 space-y-2">
            <div className="h-3.5 bg-slate-200 rounded w-1/4" />
            <div className="h-3 bg-slate-200 rounded w-3/4" />
        </div>
        <div className="w-12 h-3 bg-slate-200 rounded flex-shrink-0" />
    </motion.div>
);

/* ═══════════════════════ Reminder Extraction Engine ═══════════════════════ */
const REMINDER_PATTERNS = [
    {
        type: 'date',
        label: 'Date',
        icon: CalendarDays,
        color: '#6366f1',
        bg: 'rgba(99,102,241,0.12)',
        border: 'rgba(99,102,241,0.25)',
        patterns: [
            /\b(today|tomorrow|yesterday)\b/gi,
            /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
            /\b(next|this|last)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month|year)\b/gi,
            /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?\b/gi,
            /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g,
            /\b\d{4}-\d{2}-\d{2}\b/g,
            /\b\d{1,2}(?:st|nd|rd|th)\s+(?:of\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi,
        ],
    },
    {
        type: 'time',
        label: 'Time',
        icon: AlarmClock,
        color: '#f59e0b',
        bg: 'rgba(245,158,11,0.12)',
        border: 'rgba(245,158,11,0.25)',
        patterns: [
            /\b\d{1,2}:\d{2}\s*(?:am|pm)?\b/gi,
            /\b\d{1,2}\s*(?:am|pm)\b/gi,
            /\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi,
            /\b(noon|midnight|morning|afternoon|evening|night)\b/gi,
        ],
    },
    {
        type: 'deadline',
        label: 'Deadline',
        icon: Clock,
        color: '#ef4444',
        bg: 'rgba(239,68,68,0.12)',
        border: 'rgba(239,68,68,0.25)',
        patterns: [
            /\b(due|deadline|expires?|expiring|by|before|no later than|asap|urgent(?:ly)?|immediately|overdue)\b[^.!?\n]{0,40}/gi,
            /\b(last\s+day|final\s+date|cutoff|due\s+date|submission\s+deadline)\b[^.!?\n]{0,40}/gi,
        ],
    },
    {
        type: 'meeting',
        label: 'Meeting / Event',
        icon: MapPin,
        color: '#06b6d4',
        bg: 'rgba(6,182,212,0.12)',
        border: 'rgba(6,182,212,0.25)',
        patterns: [
            /\b(meeting|call|interview|appointment|session|webinar|conference|seminar|event|demo|presentation|standup|sync|check-?in|zoom|google meet|teams)\b[^.!?\n]{0,50}/gi,
            /\b(scheduled|has been scheduled|invite|invitation|join us|please attend|calendar)\b[^.!?\n]{0,50}/gi,
        ],
    },
    {
        type: 'task',
        label: 'Action Required',
        icon: ListChecks,
        color: '#10b981',
        bg: 'rgba(16,185,129,0.12)',
        border: 'rgba(16,185,129,0.25)',
        patterns: [
            /\b(please|kindly|action required|action needed|you need to|you must|required|mandatory|complete|submit|send|fill|sign|confirm|approve|review|respond|reply|download|upload|click|verify|activate|register)\b[^.!?\n]{0,60}/gi,
            /\b(don'?t forget|reminder|remember|note:|important:|fyi:|heads[- ]?up|todo|to-do|task)\b[^.!?\n]{0,60}/gi,
        ],
    },
];

const extractReminders = (email) => {
    const rawText = [
        email.subject || '',
        email.snippet || '',
        email.text || '',
        email.content || '',
        email.html ? email.html.replace(/<[^>]+>/g, ' ') : '',
    ].join(' ');

    const seen = new Set();
    const results = [];

    REMINDER_PATTERNS.forEach((group) => {
        const matches = [];
        group.patterns.forEach((regex) => {
            const hits = rawText.match(regex) || [];
            hits.forEach((hit) => {
                const clean = hit.trim().replace(/\s+/g, ' ').slice(0, 80);
                const key = clean.toLowerCase();
                if (!seen.has(key) && clean.length > 1) {
                    seen.add(key);
                    matches.push(clean);
                }
            });
        });
        if (matches.length > 0) results.push({ ...group, matches: matches.slice(0, 4) });
    });

    return results;
};

/* ── AI Insights & Intelligence Panel ───────────────────────────── */
const AIInsightsPanel = ({ email }) => {
    if (!email) return null;
    const cat = normalizeCategory(email.category);
    const topic = email.topic || 'General';
    const intent = email.intent || 'Information';
    const confidence = email.classificationConfidence || email.confidence || 0.85;
    const priority = email.priority || (isEmailHighPriority(email) ? 'High' : 'Normal');
    const importanceScore = email.importanceScore || (priority === 'Critical' ? 90 : (priority === 'High' ? 75 : 50));
    const sentiment = email.sentiment || 'Neutral';
    const requiresAction = email.requiresAction || false;
    const actionDescription = email.actionDescription || '';
    const deadline = email.deadline || '';
    const keywords = email.keywords || [];
    const keywordScores = email.keywordScores || [];
    const keyPhrases = email.keyPhrases || [];
    const entities = email.entities || [];

    const getPriorityStyle = (p) => {
        const lower = String(p).toLowerCase();
        if (lower.includes('crit') || lower.includes('urg')) return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b', label: 'CRITICAL' };
        if (lower.includes('high') || lower.includes('import')) return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', label: 'HIGH' };
        if (lower.includes('low')) return { bg: '#f1f5f9', border: '#cbd5e1', text: '#475569', label: 'LOW' };
        return { bg: '#e0e7ff', border: '#a5b4fc', text: '#3730a3', label: 'NORMAL' };
    };

    const priStyle = getPriorityStyle(priority);

    const getSentimentStyle = (s) => {
        if (s === 'Positive') return { bg: '#dcfce7', text: '#166534', icon: '😊' };
        if (s === 'Negative') return { bg: '#fee2e2', text: '#991b1b', icon: '⚠️' };
        return { bg: '#f1f5f9', text: '#475569', icon: '😐' };
    };

    const sentStyle = getSentimentStyle(sentiment);

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-2xl overflow-hidden bg-slate-50 border border-slate-200/90 text-slate-800 shadow-sm"
        >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-5 py-3 bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-slate-50 border-b border-blue-100/80">
                <div className="p-1.5 rounded-lg bg-blue-600 text-white shadow-xs">
                    <Brain size={14} />
                </div>
                <div>
                    <span className="text-xs font-black text-slate-900 tracking-wide uppercase block">
                        ✦ AI Email Intelligence Overview
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">Clear email summary, evidence-backed classification & next steps</span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-blue-600 text-white shadow-xs">
                        {(confidence * 100).toFixed(0)}% Match Confidence
                    </span>
                </div>
            </div>

            <div className="p-4 space-y-3.5">
                {/* Unified AI Email Intelligence Overview */}
                <div className="p-3 rounded-xl bg-white border border-blue-200/90 shadow-2xs">
                    <div className="flex items-center gap-2 mb-1 text-blue-900">
                        <Sparkles size={13} className="text-blue-600" />
                        <span className="text-xs font-black uppercase tracking-wide">Email Purpose & Next Steps</span>
                    </div>
                    <p className="text-xs text-slate-700 font-medium leading-relaxed">
                        This email is a <strong className="text-blue-900">{cat}</strong> message regarding <strong className="text-indigo-900">{topic}</strong> with <strong className="text-slate-900">{intent}</strong> intent.
                        {requiresAction || email.requiredAction ? (
                            <span className="ml-1 text-amber-900 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 inline-block">
                                ⚡ Action Needed: {email.requiredAction || actionDescription || 'Follow up required'} {deadline ? `(Deadline: ${deadline})` : ''}
                            </span>
                        ) : (
                            <span className="ml-1 text-slate-500 font-normal"> No immediate action is required.</span>
                        )}
                    </p>
                </div>

                {/* AI Classification Reason & AI Summary */}
                <div className="space-y-2">
                    <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs text-slate-800">
                        <div className="flex items-center justify-between mb-1">
                            <span className="font-black text-blue-950 flex items-center gap-1.5">
                                <ShieldCheck size={13} className="text-blue-600" />
                                AI Classification Evidence
                            </span>
                            <span className="text-[9px] font-extrabold text-blue-700 bg-blue-100/90 px-2 py-0.5 rounded-full uppercase">Verified Evidence</span>
                        </div>
                        <p className="leading-relaxed text-slate-700 font-medium">
                            {email.classificationReason || `Categorized as ${cat} based on verified subject and sender domain patterns.`}
                        </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-100/90 border border-slate-200 text-xs text-slate-800">
                        <div className="flex items-center justify-between mb-1">
                            <span className="font-black text-slate-900 flex items-center gap-1.5">
                                <CheckSquare size={13} className="text-slate-700" />
                                AI Factual Summary (Verifiable Facts Only)
                            </span>
                            <span className="text-[9px] font-extrabold text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full uppercase">Verifiable Facts</span>
                        </div>
                        <p className="leading-relaxed text-slate-700 font-medium">
                            {email.aiSummary || (email.snippet ? `${email.snippet.slice(0, 180)}...` : 'No verifiable facts extracted.')}
                        </p>
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200/80">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Category</span>
                        <span className="text-xs font-extrabold text-blue-700 truncate block">{cat}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200/80">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Topic</span>
                        <span className="text-xs font-extrabold text-indigo-700 truncate block">{topic}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200/80">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Intent</span>
                        <span className="text-xs font-extrabold text-slate-800 truncate block">{intent}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200/80">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Priority</span>
                        <span
                            className="text-[10px] font-extrabold px-2 py-0.5 rounded-md inline-block"
                            style={{ background: priStyle.bg, color: priStyle.text, border: `1px solid ${priStyle.border}` }}
                        >
                            {priStyle.label} ({importanceScore}/100)
                        </span>
                    </div>
                </div>

                {/* Action Required & Deadline Banner */}
                {(requiresAction || deadline || email.requiredAction) && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-3 rounded-xl bg-amber-50/90 border border-amber-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 font-bold">
                                <Zap size={14} />
                            </div>
                            <div>
                                <span className="text-xs font-black text-amber-950 block">Action Item Detected</span>
                                <p className="text-[11px] text-amber-900 font-medium">
                                    {email.requiredAction || actionDescription || 'Follow up or task execution required'}
                                </p>
                            </div>
                        </div>
                        {deadline && (
                            <div className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-200/70 text-amber-950 border border-amber-300 self-start sm:self-auto">
                                <Clock size={12} />
                                <span>Deadline: {deadline}</span>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Keywords & Phrases */}
                {(keywords.length > 0 || keyPhrases.length > 0) && (
                    <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                            Extracted Keywords & Topic Key-Phrases
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                            {keyPhrases.map((phrase, pi) => (
                                <span key={`kp-${pi}`} className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs">
                                    ★ {typeof phrase === 'string' ? phrase : phrase.text}
                                </span>
                            ))}
                            {keywordScores.length > 0 ? (
                                keywordScores.map((ks, ksi) => (
                                    <span key={`ks-${ksi}`} className="text-[11px] font-medium px-2 py-0.5 rounded-lg bg-white text-slate-700 border border-slate-200 flex items-center gap-1">
                                        <span>#{ks.word || ks.text}</span>
                                        <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1 rounded">{((ks.score || 0.8) * 100).toFixed(0)}%</span>
                                    </span>
                                ))
                            ) : (
                                keywords.map((kw, ki) => (
                                    <span key={`kw-${ki}`} className="text-[11px] font-medium px-2 py-0.5 rounded-lg bg-white text-slate-700 border border-slate-200">
                                        #{typeof kw === 'string' ? kw : kw.text}
                                    </span>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* Entities */}
                {entities.length > 0 && (
                    <div className="pt-2 border-t border-slate-200/60">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                            Extracted Named Entities & Structured Data
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                            {entities.map((ent, ei) => (
                                <span key={ei} className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200/90 flex items-center gap-1">
                                    <span className="text-[9px] text-slate-500 font-extrabold uppercase">{ent.type}:</span> {ent.text || ent.value}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

/* ── Reminder Panel Component ───────────────────────────────────── */
const ReminderPanel = ({ email }) => {
    const [dismissed, setDismissed] = useState(new Set());
    const reminders = useMemo(() => {
        if (email.reminders && Array.isArray(email.reminders) && email.reminders.length > 0) {
            const grouped = {};
            email.reminders.forEach((r) => {
                if (!grouped[r.type]) {
                    grouped[r.type] = [];
                }
                if (!grouped[r.type].includes(r.text)) {
                    grouped[r.type].push(r.text);
                }
            });

            return REMINDER_PATTERNS.map((pattern) => {
                const matches = grouped[pattern.type] || [];
                if (matches.length > 0) {
                    return {
                        ...pattern,
                        matches: matches.slice(0, 4)
                    };
                }
                return null;
            }).filter(Boolean);
        }
        return extractReminders(email);
    }, [email]);

    if (reminders.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="mb-6 rounded-2xl overflow-hidden bg-slate-50 border border-slate-200"
        >
            <div className="flex items-center gap-2.5 px-5 py-3.5 bg-blue-50/60 border-b border-blue-100">
                <div className="p-1.5 rounded-lg bg-blue-100 text-blue-600">
                    <Sparkles size={13} />
                </div>
                <span className="text-xs font-bold text-blue-800 uppercase tracking-widest flex items-center gap-2">
                    AI Suggested Actions
                    <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">SUGGESTION</span>
                </span>
                <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-200/70 text-blue-800 border border-blue-300">
                    {reminders.reduce((s, r) => s + r.matches.length, 0)} detected
                </span>
            </div>

            <div className="p-4 space-y-3">
                {reminders.map((group, gi) => {
                    const Icon = group.icon;
                    return (
                        <motion.div
                            key={group.type}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.15 + gi * 0.07 }}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Icon size={13} style={{ color: group.color }} />
                                <span
                                    className="text-[10px] font-bold uppercase tracking-widest"
                                    style={{ color: group.color }}
                                >
                                    {group.label}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {group.matches.map((match, mi) => {
                                    const mKey = group.type + '-' + mi;
                                    if (dismissed.has(mKey)) return null;
                                    return (
                                        <motion.span
                                            key={mi}
                                            initial={{ opacity: 0, scale: 0.85 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 0.2 + gi * 0.07 + mi * 0.04 }}
                                            className="text-[11px] font-medium px-2.5 py-1 rounded-lg leading-tight flex items-center gap-1.5 group/rem"
                                            style={{
                                                background: group.bg,
                                                border: `1px solid ${group.border}`,
                                                color: group.color,
                                                wordBreak: 'break-word',
                                            }}
                                        >
                                            {match}
                                            <button 
                                                onClick={() => setDismissed(prev => new Set(prev).add(mKey))}
                                                className="opacity-0 group-hover/rem:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
                                                title="Dismiss suggestion"
                                            >
                                                <X size={10} />
                                            </button>
                                        </motion.span>
                                    );
                                })}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </motion.div>
    );
};

/* ── Smart Replies Component ────────────────────────────────────── */
const SmartRepliesWidget = ({ email, onSelectReply }) => {
    const cat = normalizeCategory(email?.category);
    const intent = (email?.intent || '').toLowerCase();
    const senderName = email?.from?.split('<')[0].trim() || 'Sender';
    const subject = email?.subject || '';

    const replyOptions = useMemo(() => {
        if (!email) return [];
        const options = [];

        if (cat === 'Security') {
            options.push({
                label: 'Confirm Verified',
                icon: ShieldCheck,
                text: `Hi ${senderName},\n\nI have reviewed and confirmed this security notification. Thank you for the update.`
            });
            options.push({
                label: 'Request Verification',
                icon: AlertCircle,
                text: `Hi ${senderName},\n\nCould you please provide additional verification details regarding this account activity?`
            });
        } else if (cat === 'Finance') {
            options.push({
                label: 'Acknowledge & Save Receipt',
                icon: CheckCircle2,
                text: `Hi ${senderName},\n\nThank you for sending over the financial update. I have saved this for our records.`
            });
            options.push({
                label: 'Request Breakdown',
                icon: PieChart,
                text: `Hi ${senderName},\n\nCould you please send an itemized breakdown or invoice details for this item?`
            });
        } else if (cat === 'College / Student') {
            options.push({
                label: 'Accept & Confirm',
                icon: GraduationCap,
                text: `Hi ${senderName},\n\nThank you for the update. I confirm receipt and will prepare accordingly.`
            });
        } else if (intent.includes('meeting') || intent.includes('schedule') || isCalendarMail(email)) {
            options.push({
                label: 'Accept Meeting',
                icon: CalendarDays,
                text: `Hi ${senderName},\n\nThat time works great for me. Looking forward to our meeting!`
            });
            options.push({
                label: 'Propose Alternate Time',
                icon: Clock,
                text: `Hi ${senderName},\n\nThank you for reaching out. Unfortunately, I am occupied at that time. Would later this afternoon work for you?`
            });
        }

        if (options.length < 3) {
            options.push({
                label: 'Confirm Receipt',
                icon: CheckCircle2,
                text: `Hi ${senderName},\n\nThanks for reaching out! I've received your email and will follow up shortly.`
            });
        }
        if (options.length < 3) {
            options.push({
                label: 'Request Details',
                icon: Sparkles,
                text: `Hi ${senderName},\n\nThanks for the message! Could you share a few more details so I can take action on this?`
            });
        }
        if (options.length < 3) {
            options.push({
                label: 'Thank You',
                icon: Heart,
                text: `Hi ${senderName},\n\nThank you for the update! Have a great rest of your day.`
            });
        }

        return options.slice(0, 3);
    }, [cat, intent, senderName, subject, email]);

    if (!email) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.15 }}
            className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-slate-50 dark:from-slate-800/90 dark:via-indigo-950/40 dark:to-slate-900 border border-blue-200/80 dark:border-slate-700/80 shadow-2xs text-slate-800 dark:text-slate-100"
        >
            <div className="flex items-center gap-2 mb-2.5">
                <div className="p-1 rounded-md bg-blue-600 text-white">
                    <Sparkles size={12} />
                </div>
                <span className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                    ✦ AI Contextual Smart Replies
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-auto font-semibold">User review required before send</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mb-3">Select a draft response to prefill and review in compose:</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {replyOptions.map((opt, idx) => {
                    const Icon = opt.icon;
                    return (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => onSelectReply(opt.text)}
                            className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/40 text-left transition-all group shadow-2xs flex flex-col justify-between"
                        >
                            <div className="flex items-center gap-1.5 mb-1 text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                <Icon size={13} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                <span>{opt.label}</span>
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-tight font-medium">
                                "{opt.text.replace(/\n+/g, ' ')}"
                            </p>
                        </button>
                    );
                })}
            </div>
        </motion.div>
    );
};

/* ── Calendar Popover Component ────────────────────────────────── */
const CalendarPopover = ({ emails, selectedDate, onSelectDate, onSelectEmail, onClose }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const dayEmails = useMemo(() => {
        const map = {};
        emails.forEach(e => {
            if (e.receivedAt) {
                const d = new Date(e.receivedAt);
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                if (!map[dateStr]) map[dateStr] = [];
                map[dateStr].push(e);
            }
        });
        return map;
    }, [emails]);

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const days = [];
    for (let i = firstDayIndex - 1; i >= 0; i--) {
        days.push({ day: prevMonthDays - i, currentMonth: false, dateStr: null });
    }
    for (let i = 1; i <= totalDays; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        days.push({ day: i, currentMonth: true, dateStr });
    }

    const handlePrevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
    const handleNextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const selectedDayEmails = selectedDate ? (dayEmails[selectedDate] || []) : [];

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="absolute top-12 right-0 mt-2 p-4 rounded-2xl z-50 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl text-slate-800 dark:text-slate-100"
        >
            <div className="flex items-center justify-between mb-4">
                <button type="button" onClick={handlePrevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-all">&larr;</button>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">{monthNames[month]} {year}</span>
                    <button
                        type="button"
                        onClick={() => {
                            const today = new Date();
                            setCurrentMonth(today);
                            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                            onSelectDate(todayStr);
                        }}
                        className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800 transition-colors"
                    >
                        Today
                    </button>
                </div>
                <button type="button" onClick={handleNextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-all">&rarr;</button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
            </div>

            <div className="grid grid-cols-7 gap-1">
                {days.map((item, idx) => {
                    const hasEmails = item.dateStr && dayEmails[item.dateStr]?.length > 0;
                    const isSelected = selectedDate === item.dateStr;

                    return (
                        <button
                            key={idx}
                            disabled={!item.currentMonth}
                            onClick={() => {
                                if (item.dateStr) onSelectDate(isSelected ? null : item.dateStr);
                            }}
                            className={`h-8 rounded-lg text-xs font-semibold flex flex-col items-center justify-center relative transition-all ${
                                !item.currentMonth ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed' :
                                isSelected ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-500/30' :
                                hasEmails ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold hover:bg-blue-100 dark:hover:bg-blue-900/60' :
                                'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                        >
                            <span>{item.day}</span>
                            {hasEmails && !isSelected && (
                                <span className="w-1 h-1 rounded-full bg-blue-600 dark:bg-blue-400 absolute bottom-1" />
                            )}
                        </button>
                    );
                })}
            </div>

            {selectedDate && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {selectedDayEmails.length} Message{selectedDayEmails.length !== 1 ? 's' : ''} on {new Date(selectedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                        <button
                            type="button"
                            onClick={() => { onSelectDate(null); }}
                            className="text-[9px] font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 transition-colors uppercase tracking-widest"
                        >
                            Clear
                        </button>
                    </div>
                    {selectedDayEmails.length > 0 ? (
                        <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                            {selectedDayEmails.map((email) => {
                                const cat = getCategoryConfig(normalizeCategory(email.category));
                                return (
                                    <div
                                        key={email._id || email.gmailId || email.id}
                                        onClick={() => {
                                            onSelectEmail(email);
                                            onClose();
                                        }}
                                        className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50/60 dark:hover:bg-blue-950/50 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer flex items-center justify-between gap-2"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[10px] font-bold text-slate-800 dark:text-slate-100 truncate">{email.subject}</p>
                                            <p className="text-[9px] text-slate-500 dark:text-slate-400 truncate">From: {email.from?.split('<')[0].trim() || email.from}</p>
                                        </div>
                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.dot }} />
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center py-2">No emails received on this day.</p>
                    )}
                </div>
            )}
        </motion.div>
    );
};

/* ══════════════════════ Live Notification Popup Card ═════════════════════ */
const LiveNotificationCard = ({ alert, onOpen, onMarkRead, onDismiss, privacy = 'full' }) => {
    const [progress, setProgress] = useState(100);
    const [isPaused, setIsPaused] = useState(false);
    const cat = getCategoryConfig(normalizeCategory(alert.category));
    const CatIcon = cat.icon;
    const isImportant = isEmailHighPriority(alert);
    const senderName = alert.fromName || alert.sender || (alert.from && alert.from.includes('<') ? alert.from.split('<')[0].replace(/["']/g, '').trim() : alert.from) || alert.senderEmail || 'New Message';
    const emailDbId = alert._id || alert.gmailId || alert.id;
    const popupId = alert._alertId || emailDbId;
    const duration = 10000; // 10s auto-dismiss countdown

    useEffect(() => {
        if (isPaused) return;
        const startTime = Date.now();
        const initialProgress = progress;
        const remainingTime = (initialProgress / 100) * duration;

        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const currentRemaining = Math.max(0, initialProgress - (elapsed / duration) * 100);
            setProgress(currentRemaining);

            if (elapsed >= remainingTime) {
                clearInterval(interval);
                onDismiss(popupId);
            }
        }, 50);

        return () => clearInterval(interval);
    }, [isPaused, popupId, duration, onDismiss]);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: 80, scale: 0.92, y: -8 }}
            animate={{ opacity: 1, x: 0, scale: 1, y: 0 }}
            exit={{ opacity: 0, x: 80, scale: 0.88, transition: { duration: 0.22, ease: 'easeOut' } }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onClick={() => onOpen(alert)}
            className={`w-full max-w-[360px] rounded-2xl bg-white/98 backdrop-blur-2xl border shadow-[0_16px_40px_-8px_rgba(15,23,42,0.18)] overflow-hidden cursor-pointer group hover:border-slate-300 hover:shadow-[0_20px_48px_-6px_rgba(15,23,42,0.22)] transition-all relative pointer-events-auto ${
                isImportant ? 'border-amber-300 ring-2 ring-amber-400/30' : 'border-slate-200/90'
            }`}
        >
            {/* Top glowing category accent line */}
            <div
                className="h-1.5 w-full"
                style={{
                    background: isImportant
                        ? 'linear-gradient(90deg, #f59e0b, #ef4444, #f59e0b)'
                        : `linear-gradient(90deg, ${cat.dot}, ${cat.dot}bb, ${cat.dot}44)`,
                }}
            />

            {/* Header: Avatar, Sender, Category Tag & Close */}
            <div className="p-3.5 pb-2 flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Sender Initials Avatar */}
                    <div className="relative flex-shrink-0">
                        <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white text-xs select-none shadow-sm"
                            style={{
                                background: isImportant
                                    ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                                    : `linear-gradient(135deg, ${getSenderColor(alert.from)} 0%, ${getSenderColor(alert.from)}cc 100%)`,
                            }}
                        >
                            {isImportant ? '⭐' : getSenderInitials(alert.from)}
                        </div>
                        <div
                            className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center text-[8px] text-white shadow-xs"
                            style={{ background: cat.dot }}
                            title={normalizeCategory(alert.category)}
                        >
                            <CatIcon size={9} />
                        </div>
                    </div>

                    {/* Sender & Category */}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                            <h4 className="text-xs font-black text-slate-900 truncate">
                                {senderName}
                            </h4>
                            <span className="text-[10px] text-slate-400 font-medium flex-shrink-0">
                                {formatTime(alert.receivedAt)}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {isImportant && (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-xs">
                                    ⭐ IMPORTANT
                                </span>
                            )}
                            <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                                style={{ background: `${cat.dot}18`, color: cat.dot, border: `1px solid ${cat.dot}35` }}
                            >
                                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: cat.dot }} />
                                {normalizeCategory(alert.category)}
                            </span>
                        </div>
                    </div>
                </div>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDismiss(popupId);
                    }}
                    className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all flex-shrink-0"
                    title="Dismiss"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Body: Subject & Snippet Preview with Privacy Respect */}
            <div className="px-3.5 py-1.5">
                <p className="text-xs font-bold text-slate-900 line-clamp-1 mb-1 group-hover:text-blue-600 transition-colors">
                    {privacy === 'private' ? 'New Message' : (alert.subject || '(No Subject)')}
                </p>
                <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                    {privacy === 'private' 
                        ? 'Message content hidden for privacy' 
                        : privacy === 'sender_subject' 
                            ? 'Message preview hidden' 
                            : (alert.snippet || alert.text || alert.content || '(No message preview)')}
                </p>
            </div>

            {/* Actions Bar */}
            <div
                className="p-2.5 pt-2 bg-slate-50/90 border-t border-slate-100 flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={() => onOpen(alert)}
                    className="flex-1 py-1.5 px-3 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-98 shadow-sm shadow-blue-500/20 transition-all flex items-center justify-center gap-1.5"
                >
                    <Inbox size={13} />
                    Open Email
                </button>
                <button
                    onClick={() => onMarkRead(emailDbId)}
                    className="py-1.5 px-2.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 hover:bg-emerald-100 active:scale-98 transition-all flex items-center gap-1"
                    title="Mark as read"
                >
                    <CheckCircle2 size={13} />
                    Read
                </button>
                <button
                    onClick={() => onDismiss(popupId)}
                    className="py-1.5 px-2.5 rounded-xl text-xs font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-100 hover:text-slate-800 active:scale-98 transition-all"
                    title="Dismiss notification"
                >
                    Dismiss
                </button>
            </div>

            {/* Countdown Progress Bar */}
            <div className="w-full bg-slate-100 h-1 overflow-hidden">
                <div
                    className="h-full transition-all ease-linear"
                    style={{
                        width: `${progress}%`,
                        background: isImportant ? '#f59e0b' : cat.dot,
                        transitionDuration: isPaused ? '0ms' : '40ms',
                    }}
                />
            </div>
        </motion.div>
    );
};

/* ══════════════════════════════ Dashboard ══════════════════════════════════ */
const Dashboard = () => {
    const { user, isGoogleConnected, checkAuthStatus, logout } = useAuth();
    const [emails, setEmails] = useState([]);
    const [selectedEmail, setSelectedEmail] = useState(null);
    const [activeFolder, setActiveFolder] = useState('inbox');
    const [activeCategory, setActiveCategory] = useState('All');
    const [sortBy, setSortBy] = useState('newest');
    const [filterChip, setFilterChip] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [isConnected, setIsConnected] = useState(false);
    const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [syncSuccessMsg, setSyncSuccessMsg] = useState(false);
    const [syncStatusMsg, setSyncStatusMsg] = useState(null);
    const [authExpired, setAuthExpired] = useState(!isGoogleConnected);
    
    /* ── Compose Window State ── */
    const [isComposeOpen, setIsComposeOpen] = useState(false);
    const [composeData, setComposeData] = useState({ to: '', subject: '', body: '' });
    const [composeSending, setComposeSending] = useState(false);
    const [composeSent, setComposeSent] = useState(false);
    
    const [activeAlerts, setActiveAlerts] = useState([]);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [selectedDate, setSelectedDate] = useState(null);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [isNotifModalOpen, setIsNotifModalOpen] = useState(false);

    /* ── Storage, Undo & Category Correction States ─── */
    const [undoToast, setUndoToast] = useState(null);
    const undoTimeoutRef = useRef(null);
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [storageStats, setStorageStats] = useState({ emailCount: 0, pendingActionsCount: 0, usageMb: null, quotaMb: null });
    const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
    const [isCorrectionsModalOpen, setIsCorrectionsModalOpen] = useState(false);
    const [userCorrectionsList, setUserCorrectionsList] = useState([]);
    const [categoryMenuOpenForId, setCategoryMenuOpenForId] = useState(null);

    /* ── Dark Theme & Mobile Menu State ── */
    const [isDarkMode, setIsDarkMode] = useState(() => {
        try {
            const saved = localStorage.getItem('livemail_theme');
            if (saved) return saved === 'dark';
            return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        } catch (e) {
            return false;
        }
    });
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const searchInputRef = useRef(null);

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
            try { localStorage.setItem('livemail_theme', 'dark'); } catch (e) {}
        } else {
            document.documentElement.classList.remove('dark');
            try { localStorage.setItem('livemail_theme', 'light'); } catch (e) {}
        }
    }, [isDarkMode]);

    const [reconnectingToast, setReconnectingToast] = useState(false);

    /* ── Notification & Sound Settings ─── */
    const [desktopPerm, setDesktopPerm] = useState(() => {
        return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default';
    });

    const [notifSettings, setNotifSettings] = useState(() => {
        try {
            const saved = localStorage.getItem('livemail_notif_prefs');
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return {
            sound: true,
            desktop: true,
            popup: true,
            privacy: 'full', // 'full' | 'sender_subject' | 'private'
            normalSound: 'chime',
            importantSound: 'dual_bell',
            volume: 0.6,
        };
    });

    const updateNotifSetting = (key, value) => {
        setNotifSettings(prev => {
            const updated = { ...prev, [key]: value };
            try { localStorage.setItem('livemail_notif_prefs', JSON.stringify(updated)); } catch(e) {}
            return updated;
        });
    };

    useEffect(() => {
        if (!isGoogleConnected) {
            setAuthExpired(true);
        }
    }, [isGoogleConnected]);

    // Unlock browser Web Audio API on first user interaction so sounds play instantly
    useEffect(() => {
        const unlockAudio = () => {
            getSharedAudioContext();
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
            window.removeEventListener('touchstart', unlockAudio);
        };
        window.addEventListener('click', unlockAudio, { once: true });
        window.addEventListener('keydown', unlockAudio, { once: true });
        window.addEventListener('touchstart', unlockAudio, { once: true });
        return () => {
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
            window.removeEventListener('touchstart', unlockAudio);
        };
    }, []);

    const requestDesktopNotificationPermission = async () => {
        if ('Notification' in window) {
            try {
                const perm = await Notification.requestPermission();
                setDesktopPerm(perm);
                if (perm === 'granted') {
                    updateNotifSetting('desktop', true);
                    playSynthesisSound('dual_bell', 0.6);
                    new Notification('⭐ LiveMail Classifier', {
                        body: 'Desktop notifications are now enabled!',
                        icon: 'https://cdn-icons-png.flaticon.com/512/732/732200.png'
                    });
                }
            } catch (e) {
                console.error('Notification permission error:', e);
            }
        }
    };

    /* ── Sound Synthesizer Engine (Web Audio API) ──────────────── */
    const playSynthesisSound = useCallback((soundName, overrideVolume = null) => {
        try {
            const ctx = getSharedAudioContext();
            if (!ctx) return;
            if (ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
            }
            const now = ctx.currentTime;
            const baseVol = overrideVolume !== null ? overrideVolume : (notifSettings.volume !== undefined ? notifSettings.volume : 0.6);
            const vol = Math.max(0.08, Math.min(1.0, baseVol * 0.95));
            console.log(`🔔 [Audio Chime] Playing: ${soundName} (vol: ${vol.toFixed(2)})`);

            /* 1. Standard Chime (Normal) */
            if (soundName === 'chime') {
                const osc1 = ctx.createOscillator();
                const gain1 = ctx.createGain();
                osc1.type = 'sine';
                osc1.frequency.setValueAtTime(659.25, now); // E5
                gain1.gain.setValueAtTime(vol * 0.8, now);
                gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                osc1.connect(gain1);
                gain1.connect(ctx.destination);
                osc1.start(now);
                osc1.stop(now + 0.35);

                const osc2 = ctx.createOscillator();
                const gain2 = ctx.createGain();
                osc2.type = 'triangle';
                osc2.frequency.setValueAtTime(830.61, now + 0.08); // G#5
                gain2.gain.setValueAtTime(vol, now + 0.08);
                gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                osc2.connect(gain2);
                gain2.connect(ctx.destination);
                osc2.start(now + 0.08);
                osc2.stop(now + 0.5);
            }
            /* 2. Harp Chord (Normal) */
            else if (soundName === 'harp') {
                [523.25, 659.25, 783.99].forEach((freq, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, now + idx * 0.05);
                    gain.gain.setValueAtTime(vol * 0.7, now + idx * 0.05);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.4);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + idx * 0.05);
                    osc.stop(now + idx * 0.05 + 0.4);
                });
            }
            /* 3. Soft Pop (Normal) */
            else if (soundName === 'pop') {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(640, now);
                osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
                gain.gain.setValueAtTime(vol * 0.9, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.08);
            }
            /* 4. Soft Bell (Normal) */
            else if (soundName === 'soft_bell') {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1046.50, now); // C6
                gain.gain.setValueAtTime(vol, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.55);
            }
            /* 5. Dual Bell (Important / Priority) */
            else if (soundName === 'dual_bell') {
                [880, 1318.51].forEach((freq, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, now + idx * 0.07);
                    gain.gain.setValueAtTime(vol * 0.9, now + idx * 0.07);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.45);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + idx * 0.07);
                    osc.stop(now + idx * 0.07 + 0.45);
                });
            }
            /* 6. Urgent Alert Ping (Important / Priority) */
            else if (soundName === 'urgent_ping') {
                [1760, 1760].forEach((freq, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(freq, now + idx * 0.09);
                    gain.gain.setValueAtTime(vol * 0.7, now + idx * 0.09);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.2);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + idx * 0.09);
                    osc.stop(now + idx * 0.09 + 0.2);
                });
            }
            /* 7. Siren Warning (Important / Priority) */
            else if (soundName === 'siren') {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(880, now);
                osc.frequency.linearRampToValueAtTime(1320, now + 0.12);
                osc.frequency.linearRampToValueAtTime(880, now + 0.24);
                gain.gain.setValueAtTime(vol * 0.85, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.35);
            }
            /* 8. Executive Chord (Important / Priority) */
            else if (soundName === 'executive') {
                [440, 554.37, 659.25, 880].forEach((freq, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, now + idx * 0.03);
                    gain.gain.setValueAtTime(vol * 0.6, now + idx * 0.03);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.03 + 0.5);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + idx * 0.03);
                    osc.stop(now + idx * 0.03 + 0.5);
                });
            }
        } catch (e) {
            console.log('Audio chime error:', e);
        }
    }, [notifSettings.volume]);

    /* ── Undo Toast Helper ─────────────────────────────────────── */
    const triggerUndoToast = useCallback((message, revertFn) => {
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
        setUndoToast({ message, onUndo: revertFn });
        undoTimeoutRef.current = setTimeout(() => {
            setUndoToast(null);
        }, 6000);
    }, []);

    const removeAlert = useCallback((alertId) => {
        setActiveAlerts(prev => prev.filter(a => a._alertId !== alertId && a._id !== alertId && a.gmailId !== alertId && a.id !== alertId));
    }, []);

    const notifSettingsRef = useRef(notifSettings);
    useEffect(() => {
        notifSettingsRef.current = notifSettings;
    }, [notifSettings]);

    const pushAlert = useCallback((email) => {
        if (!email) return;
        const emailDbId = email._id || email.gmailId || email.id;
        const alertId = 'alert-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        const alertItem = { ...email, _alertId: alertId, receivedAt: email.receivedAt || new Date() };

        const settings = notifSettingsRef.current || {};
        if (settings.popup !== false) {
            setActiveAlerts(prev => [
                alertItem,
                ...prev.filter(a => {
                    const existingDbId = a._id || a.gmailId || a.id;
                    return !existingDbId || existingDbId !== emailDbId;
                }).slice(0, 3)
            ]);
        }
    }, []);

    /* ── Mark as read with IndexedDB and Backend Sync ──────────── */
    const handleMarkAsRead = useCallback(async (emailId, toggle = false) => {
        if (!emailId) return;

        let newReadState = true;
        setEmails(prev => prev.map(m => {
            if (m._id === emailId || m.gmailId === emailId || m.id === emailId) {
                newReadState = toggle ? !m.isRead : true;
                return { ...m, isRead: newReadState };
            }
            return m;
        }));

        if (selectedEmail && (selectedEmail._id === emailId || selectedEmail.gmailId === emailId || selectedEmail.id === emailId)) {
            setSelectedEmail(prev => ({ ...prev, isRead: newReadState }));
        }
        removeAlert(emailId);

        // Persist in local IndexedDB
        await updateCachedEmail(emailId, { isRead: newReadState });

        // Persist in backend if online, or queue for reconnection
        if (navigator.onLine) {
            try {
                const endpoint = newReadState ? 'read' : 'unread';
                await axios.patch(`${SOCKET_URL}/api/emails/${emailId}/${endpoint}`, {}, { withCredentials: true });
            } catch (_) {
                await enqueuePendingAction(newReadState ? 'read' : 'unread', emailId);
                setPendingSyncCount(c => c + 1);
            }
        } else {
            await enqueuePendingAction(newReadState ? 'read' : 'unread', emailId);
            setPendingSyncCount(c => c + 1);
        }
    }, [removeAlert, selectedEmail]);

    /* ── Toggle Star with IndexedDB and Backend Sync ───────────── */
    const handleToggleStar = useCallback(async (emailItem, e) => {
        if (e) e.stopPropagation();
        if (!emailItem) return;
        const emailId = emailItem._id || emailItem.gmailId || emailItem.id;
        const newStarred = !emailItem.isStarred;

        // Optimistic UI update
        setEmails(prev => prev.map(m => (m._id === emailId || m.gmailId === emailId || m.id === emailId) ? { ...m, isStarred: newStarred } : m));
        if (selectedEmail && (selectedEmail._id === emailId || selectedEmail.gmailId === emailId || selectedEmail.id === emailId)) {
            setSelectedEmail(prev => ({ ...prev, isStarred: newStarred }));
        }

        await updateCachedEmail(emailId, { isStarred: newStarred });

        if (navigator.onLine) {
            try {
                await axios.patch(`${SOCKET_URL}/api/emails/${emailId}/star`, { isStarred: newStarred }, { withCredentials: true });
            } catch (_) {
                await enqueuePendingAction(newStarred ? 'star' : 'unstar', emailId);
                setPendingSyncCount(c => c + 1);
            }
        } else {
            await enqueuePendingAction(newStarred ? 'star' : 'unstar', emailId);
            setPendingSyncCount(c => c + 1);
        }
    }, [selectedEmail]);

    /* ── Archive & Unarchive with Undo Support ─────────────────── */
    const handleArchive = useCallback(async (emailItem, e) => {
        if (e) e.stopPropagation();
        if (!emailItem) return;
        const emailId = emailItem._id || emailItem.gmailId || emailItem.id;

        setEmails(prev => prev.map(m => (m._id === emailId || m.gmailId === emailId || m.id === emailId) ? { ...m, isArchived: true, isTrash: false } : m));
        if (selectedEmail && (selectedEmail._id === emailId || selectedEmail.gmailId === emailId || selectedEmail.id === emailId)) {
            setSelectedEmail(prev => ({ ...prev, isArchived: true, isTrash: false }));
        }
        removeAlert(emailId);

        await updateCachedEmail(emailId, { isArchived: true, isTrash: false });

        if (navigator.onLine) {
            try {
                await axios.patch(`${SOCKET_URL}/api/emails/${emailId}/archive`, {}, { withCredentials: true });
            } catch (_) {
                await enqueuePendingAction('archive', emailId);
                setPendingSyncCount(c => c + 1);
            }
        } else {
            await enqueuePendingAction('archive', emailId);
            setPendingSyncCount(c => c + 1);
        }

        triggerUndoToast('Email moved to Archive', () => handleUnarchive(emailItem));
    }, [removeAlert, selectedEmail, triggerUndoToast]);

    const handleUnarchive = useCallback(async (emailItem, e) => {
        if (e) e.stopPropagation();
        if (!emailItem) return;
        const emailId = emailItem._id || emailItem.gmailId || emailItem.id;

        setEmails(prev => prev.map(m => (m._id === emailId || m.gmailId === emailId || m.id === emailId) ? { ...m, isArchived: false } : m));
        if (selectedEmail && (selectedEmail._id === emailId || selectedEmail.gmailId === emailId || selectedEmail.id === emailId)) {
            setSelectedEmail(prev => ({ ...prev, isArchived: false }));
        }

        await updateCachedEmail(emailId, { isArchived: false });

        if (navigator.onLine) {
            try {
                await axios.patch(`${SOCKET_URL}/api/emails/${emailId}/unarchive`, {}, { withCredentials: true });
            } catch (_) {
                await enqueuePendingAction('unarchive', emailId);
                setPendingSyncCount(c => c + 1);
            }
        } else {
            await enqueuePendingAction('unarchive', emailId);
            setPendingSyncCount(c => c + 1);
        }

        triggerUndoToast('Email restored to Inbox', () => handleArchive(emailItem));
    }, [selectedEmail, triggerUndoToast, handleArchive]);

    /* ── Trash & Restore with Soft-Delete & Undo Support ────────── */
    const handleTrash = useCallback(async (emailItem, e) => {
        if (e) e.stopPropagation();
        if (!emailItem) return;
        const emailId = emailItem._id || emailItem.gmailId || emailItem.id;

        // If currently viewing trash, permanent delete
        if (activeFolder === 'trash' || emailItem.isTrash) {
            if (!window.confirm('Permanently delete this email? This cannot be undone.')) return;

            setEmails(prev => prev.filter(m => m._id !== emailId && m.gmailId !== emailId && m.id !== emailId));
            if (selectedEmail && (selectedEmail._id === emailId || selectedEmail.gmailId === emailId || selectedEmail.id === emailId)) {
                setSelectedEmail(null);
            }
            removeAlert(emailId);

            await deleteCachedEmail(emailId);
            if (emailItem.gmailId) await deleteCachedEmail(emailItem.gmailId);

            if (navigator.onLine) {
                try {
                    await axios.delete(`${SOCKET_URL}/api/emails/${emailId}`, { withCredentials: true });
                } catch (_) {
                    await enqueuePendingAction('delete', emailId);
                    setPendingSyncCount(c => c + 1);
                }
            } else {
                await enqueuePendingAction('delete', emailId);
                setPendingSyncCount(c => c + 1);
            }
            return;
        }

        // Soft delete to Trash
        setEmails(prev => prev.map(m => (m._id === emailId || m.gmailId === emailId || m.id === emailId) ? { ...m, isTrash: true, isArchived: false } : m));
        if (selectedEmail && (selectedEmail._id === emailId || selectedEmail.gmailId === emailId || selectedEmail.id === emailId)) {
            setSelectedEmail(prev => ({ ...prev, isTrash: true, isArchived: false }));
        }
        removeAlert(emailId);

        await updateCachedEmail(emailId, { isTrash: true, isArchived: false });

        if (navigator.onLine) {
            try {
                await axios.patch(`${SOCKET_URL}/api/emails/${emailId}/trash`, {}, { withCredentials: true });
            } catch (_) {
                await enqueuePendingAction('trash', emailId);
                setPendingSyncCount(c => c + 1);
            }
        } else {
            await enqueuePendingAction('trash', emailId);
            setPendingSyncCount(c => c + 1);
        }

        triggerUndoToast('Email moved to Trash', () => handleRestore(emailItem));
    }, [activeFolder, removeAlert, selectedEmail, triggerUndoToast]);

    const handleRestore = useCallback(async (emailItem, e) => {
        if (e) e.stopPropagation();
        if (!emailItem) return;
        const emailId = emailItem._id || emailItem.gmailId || emailItem.id;

        setEmails(prev => prev.map(m => (m._id === emailId || m.gmailId === emailId || m.id === emailId) ? { ...m, isTrash: false, isArchived: false } : m));
        if (selectedEmail && (selectedEmail._id === emailId || selectedEmail.gmailId === emailId || selectedEmail.id === emailId)) {
            setSelectedEmail(prev => ({ ...prev, isTrash: false, isArchived: false }));
        }

        await updateCachedEmail(emailId, { isTrash: false, isArchived: false });

        if (navigator.onLine) {
            try {
                await axios.patch(`${SOCKET_URL}/api/emails/${emailId}/restore`, {}, { withCredentials: true });
            } catch (_) {
                await enqueuePendingAction('restore', emailId);
                setPendingSyncCount(c => c + 1);
            }
        } else {
            await enqueuePendingAction('restore', emailId);
            setPendingSyncCount(c => c + 1);
        }

        triggerUndoToast('Email restored to Inbox', () => handleTrash(emailItem));
    }, [selectedEmail, triggerUndoToast, handleTrash]);

    /* ── Change Category & Adaptive NLP Learning ───────────────── */
    const handleChangeCategory = useCallback(async (emailItem, newCategory, reason = 'User reclassified', e) => {
        if (e) e.stopPropagation();
        if (!emailItem || !newCategory) return;
        const emailId = emailItem._id || emailItem.gmailId || emailItem.id;
        const previousCategory = emailItem.category || 'Primary';
        const origCat = emailItem.originalCategory || emailItem.category || 'Primary';

        setCategoryMenuOpenForId(null);

        // Optimistic UI update
        setEmails(prev => prev.map(m => (m._id === emailId || m.gmailId === emailId || m.id === emailId) ? {
            ...m,
            category: newCategory,
            originalCategory: origCat,
            categoryCorrectedByUser: true,
            correctionReason: reason
        } : m));

        if (selectedEmail && (selectedEmail._id === emailId || selectedEmail.gmailId === emailId || selectedEmail.id === emailId)) {
            setSelectedEmail(prev => ({
                ...prev,
                category: newCategory,
                originalCategory: origCat,
                categoryCorrectedByUser: true,
                correctionReason: reason
            }));
        }

        // Persist in IndexedDB
        await updateCachedEmail(emailId, {
            category: newCategory,
            originalCategory: origCat,
            categoryCorrectedByUser: true,
            correctionReason: reason
        });

        // Save local correction for future NLP classifications
        await saveUserCorrectionLocal({
            senderEmail: emailItem.from,
            originalCategory: origCat,
            correctedCategory: newCategory,
            reason
        });

        // Sync with backend if online, or queue for reconnection
        if (navigator.onLine) {
            try {
                await axios.patch(`${SOCKET_URL}/api/emails/${emailId}/category`, { category: newCategory, reason }, { withCredentials: true });
            } catch (_) {
                await enqueuePendingAction('changeCategory', emailId, { category: newCategory, reason });
                setPendingSyncCount(c => c + 1);
            }
        } else {
            await enqueuePendingAction('changeCategory', emailId, { category: newCategory, reason });
            setPendingSyncCount(c => c + 1);
        }

        triggerUndoToast(`Moved to ${newCategory}`, () => {
            handleChangeCategory(emailItem, previousCategory, 'Undid category change');
        });
    }, [selectedEmail, triggerUndoToast]);

    const handleUndoCategoryCorrection = useCallback(async (emailItem) => {
        if (!emailItem) return;
        const emailId = emailItem._id || emailItem.gmailId || emailItem.id;
        const targetCategory = emailItem.originalCategory || 'Primary';

        setEmails(prev => prev.map(m => (m._id === emailId || m.gmailId === emailId || m.id === emailId) ? {
            ...m,
            category: targetCategory,
            categoryCorrectedByUser: false
        } : m));

        if (selectedEmail && (selectedEmail._id === emailId || selectedEmail.gmailId === emailId || selectedEmail.id === emailId)) {
            setSelectedEmail(prev => ({ ...prev, category: targetCategory, categoryCorrectedByUser: false }));
        }

        await updateCachedEmail(emailId, { category: targetCategory, categoryCorrectedByUser: false });

        if (navigator.onLine) {
            try {
                await axios.post(`${SOCKET_URL}/api/emails/undo-category-correction`, {
                    emailId,
                    senderEmail: emailItem.from
                }, { withCredentials: true });
            } catch (_) {
                await enqueuePendingAction('undoCategoryCorrection', emailId, { senderEmail: emailItem.from });
                setPendingSyncCount(c => c + 1);
            }
        } else {
            await enqueuePendingAction('undoCategoryCorrection', emailId, { senderEmail: emailItem.from });
            setPendingSyncCount(c => c + 1);
        }

        triggerUndoToast(`Reverted category to ${targetCategory}`);
    }, [selectedEmail, triggerUndoToast]);

    /* ── Open email with Offline-First IndexedDB Retrieval ────── */
    const handleOpenEmail = useCallback(async (emailItem) => {
        if (!emailItem) return;
        const emailId = emailItem._id || emailItem.gmailId || emailItem.id;

        // Check if full content is already present
        let fullDoc = emailItem;
        if (!fullDoc.html && !fullDoc.text && !fullDoc.content) {
            // Retrieve from IndexedDB cache
            const cached = await getCachedEmailById(emailId);
            if (cached && (cached.html || cached.text || cached.content)) {
                fullDoc = cached;
            } else if (navigator.onLine) {
                try {
                    const res = await axios.get(`${SOCKET_URL}/api/emails/${emailId}`, { withCredentials: true });
                    if (res.data?.success && res.data?.email) {
                        fullDoc = res.data.email;
                        await saveEmailToCache(fullDoc);
                    }
                } catch (e) {
                    console.log('Backend lookup note:', e?.message);
                }
            }
        }

        setSelectedEmail(fullDoc);
        removeAlert(emailId);

        // Mark as read automatically
        if (!fullDoc.isRead) {
            handleMarkAsRead(emailId);
        }
    }, [handleMarkAsRead, removeAlert]);

    /* ── Desktop Notification with Privacy Support ─────────────── */
    const showDesktopNotification = useCallback((email) => {
        if ('Notification' in window && Notification.permission === 'granted' && notifSettings.desktop !== false) {
            try {
                const privacy = notifSettings.privacy || 'full';
                const cat = normalizeCategory(email.category);
                const isImportant = isEmailHighPriority(email);
                const senderClean = email.from?.split('<')[0].replace(/"/g, '').trim() || email.from || 'New Message';

                let title = isImportant ? `⭐ [IMPORTANT] ${senderClean}` : `📬 [${cat.toUpperCase()}] ${senderClean}`;
                let body = `Subject: ${email.subject || 'No Subject'}\n${(email.snippet || email.text || email.content || '').slice(0, 90)}`;

                if (privacy === 'sender_subject') {
                    body = `Subject: ${email.subject || 'No Subject'}`;
                } else if (privacy === 'private') {
                    title = '📬 LiveMail Alert';
                    body = 'You have received a new email message.';
                }

                const notif = new Notification(title, {
                    body,
                    icon: 'https://cdn-icons-png.flaticon.com/512/732/732200.png',
                    tag: String(email._id || email.gmailId || email.id || Date.now()),
                });
                notif.onclick = () => {
                    window.focus();
                    handleOpenEmail(email);
                    notif.close();
                };
            } catch (e) {
                console.error('Desktop notification error:', e);
            }
        }
    }, [notifSettings.desktop, notifSettings.privacy, handleOpenEmail]);

    /* Keyboard navigation shortcut: Ctrl+K / '/' for search, j/k/arrows for list, Enter/o to open, Esc/u to close, e/a archive, d/# delete, s star, m read */
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
                if (e.key === 'Escape') {
                    document.activeElement.blur();
                }
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                searchInputRef.current?.focus();
            } else if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                e.preventDefault();
                searchInputRef.current?.focus();
            } else if (e.key === 'Escape' || e.key === 'u') {
                if (selectedEmail) setSelectedEmail(null);
                if (isComposeOpen) setIsComposeOpen(false);
                if (isNotifModalOpen) setIsNotifModalOpen(false);
                if (isStorageModalOpen) setIsStorageModalOpen(false);
                if (isCorrectionsModalOpen) setIsCorrectionsModalOpen(false);
                if (mobileMenuOpen) setMobileMenuOpen(false);
            } else if (e.key === 'j' || e.key === 'ArrowDown') {
                e.preventDefault();
                setEmails(prev => {
                    if (!prev || prev.length === 0) return prev;
                    const curIdx = selectedEmail ? prev.findIndex(item => (item._id === selectedEmail._id || item.id === selectedEmail.id || item.gmailId === selectedEmail.gmailId)) : -1;
                    const nextIdx = Math.min(prev.length - 1, curIdx + 1);
                    if (prev[nextIdx]) {
                        setSelectedEmail(prev[nextIdx]);
                    }
                    return prev;
                });
            } else if (e.key === 'k' || e.key === 'ArrowUp') {
                e.preventDefault();
                setEmails(prev => {
                    if (!prev || prev.length === 0) return prev;
                    const curIdx = selectedEmail ? prev.findIndex(item => (item._id === selectedEmail._id || item.id === selectedEmail.id || item.gmailId === selectedEmail.gmailId)) : -1;
                    const prevIdx = Math.max(0, curIdx - 1);
                    if (prev[prevIdx]) {
                        setSelectedEmail(prev[prevIdx]);
                    }
                    return prev;
                });
            } else if ((e.key === 'Enter' || e.key === 'o') && selectedEmail) {
                e.preventDefault();
                handleOpenEmail(selectedEmail);
            } else if ((e.key === 'e' || e.key === 'a') && selectedEmail) {
                e.preventDefault();
                handleArchive(selectedEmail);
            } else if ((e.key === '#' || e.key === 'd' || e.key === 'Delete') && selectedEmail) {
                e.preventDefault();
                handleTrash(selectedEmail);
            } else if (e.key === 's' && selectedEmail) {
                e.preventDefault();
                handleToggleStar(selectedEmail._id || selectedEmail.gmailId || selectedEmail.id);
            } else if (e.key === 'm' && selectedEmail) {
                e.preventDefault();
                handleMarkAsRead(selectedEmail._id || selectedEmail.gmailId || selectedEmail.id, true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedEmail, isComposeOpen, isNotifModalOpen, isStorageModalOpen, isCorrectionsModalOpen, mobileMenuOpen, handleOpenEmail, handleArchive, handleTrash, handleToggleStar, handleMarkAsRead]);

    const isInitialLoadRef = useRef(true);
    const recentAlertsRef = useRef(new Map());

    const latestHandlersRef = useRef({
        playSynthesisSound,
        showDesktopNotification,
        pushAlert,
        notifSettings,
    });
    useEffect(() => {
        latestHandlersRef.current = {
            playSynthesisSound,
            showDesktopNotification,
            pushAlert,
            notifSettings,
        };
    });

    /* ── Fetch emails (IndexedDB Cache + Backend Sync) ─────────── */
    const fetchEmails = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);

            // 1. Flush any pending offline actions first if online
            if (navigator.onLine) {
                const syncResult = await flushPendingActions(SOCKET_URL);
                setPendingSyncCount(syncResult.pending || 0);
            }

            // 2. Fetch stored emails from backend MongoDB
            const res = await axios.get(`${SOCKET_URL}/api/emails?includeAll=true`, { withCredentials: true });
            const list = Array.isArray(res.data) ? res.data : (res.data?.emails || res.data?.data || []);

            // 3. Process new emails & avoid re-notifying already acknowledged messages
            const { pushAlert, playSynthesisSound, showDesktopNotification, notifSettings } = latestHandlersRef.current;

            if (!isInitialLoadRef.current) {
                for (const em of list) {
                    const k = String(em.gmailMessageId || em.gmailId || em._id || em.id || '');
                    if (k) {
                        const alreadyNotified = await isEmailNotifiedLocal(k);
                        if (!alreadyNotified && !em.isRead && !em.isTrash && !em.isArchived) {
                            await recordEmailNotifiedLocal(k);
                            pushAlert(em);
                            if (notifSettings.desktop !== false) {
                                showDesktopNotification(em);
                            }
                            if (notifSettings.sound !== false) {
                                const isImportant = isEmailHighPriority(em);
                                playSynthesisSound(isImportant ? (notifSettings.importantSound || 'dual_bell') : (notifSettings.normalSound || 'chime'));
                            }
                        }
                    }
                }
            } else {
                // Initial load: seed local notified store so we never replay alerts on page refresh
                for (const em of list) {
                    const k = String(em.gmailMessageId || em.gmailId || em._id || em.id || '');
                    if (k) await recordEmailNotifiedLocal(k);
                }
                isInitialLoadRef.current = false;
            }

            // 4. Save newly fetched emails into browser IndexedDB cache
            if (list.length > 0) {
                await saveEmailsToCache(list);
            }

            // 5. Update local state
            const sortedList = [...list].sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0));
            setEmails(sortedList);

            // 6. Update storage and correction metrics
            const usage = await getStorageUsageEstimate();
            setStorageStats(usage);
            const corrections = await getUserCorrectionsLocal();
            setUserCorrectionsList(corrections);
        } catch (e) {
            console.warn('fetchEmails network note:', e.message);
            // On network failure, fallback gracefully to IndexedDB cached emails
            const cached = await getCachedEmails(user?.email);
            if (cached && cached.length > 0) {
                setEmails(cached.sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0)));
            }
            const usage = await getStorageUsageEstimate();
            setStorageStats(usage);
        } finally {
            if (!silent) setLoading(false);
            setIsRefreshing(false);
        }
    }, [user?.email]);

    /* ── Delete email (wrapper delegating to handleTrash) ──────── */
    const deleteEmail = useCallback((target) => {
        handleTrash(target);
    }, [handleTrash]);

    /* ── Trigger manual incremental sync ──────────────────────── */
    const handleManualSync = async () => {
        if (!navigator.onLine) {
            setSyncStatusMsg({
                type: 'warning',
                text: 'Offline: Local IndexedDB database is active.'
            });
            setTimeout(() => setSyncStatusMsg(null), 4000);
            return;
        }
        try {
            setIsRefreshing(true);
            const flushRes = await flushPendingActions(SOCKET_URL);
            setPendingSyncCount(flushRes.pending || 0);

            const res = await axios.post(`${SOCKET_URL}/api/emails/sync`, {}, { withCredentials: true });
            await fetchEmails(true);
            const count = res.data?.synced || 0;
            setAuthExpired(false);
            setSyncStatusMsg({
                type: 'success',
                text: count > 0 ? `Synced ${count} new message${count > 1 ? 's' : ''}!` : 'All messages up to date!'
            });
            setSyncSuccessMsg(true);
            setTimeout(() => {
                setSyncSuccessMsg(false);
                setSyncStatusMsg(null);
            }, 3500);
        } catch (err) {
            console.error('Sync note:', err);
            await fetchEmails(true);
            if (err.response?.status === 401) {
                setAuthExpired(true);
                setSyncStatusMsg({
                    type: 'error',
                    text: 'Google account not linked. Storing locally.'
                });
            } else {
                setSyncStatusMsg({
                    type: 'success',
                    text: 'Local database verified & updated.'
                });
            }
            setTimeout(() => setSyncStatusMsg(null), 4500);
        } finally {
            setIsRefreshing(false);
        }
    };

    /* ── Initial Load & Offline/Online Detection ───────────────── */
    useEffect(() => {
        let isMounted = true;

        // 1. Instantly load from IndexedDB cache for zero-latency startup
        getCachedEmails(user?.email).then(cached => {
            if (isMounted && cached && cached.length > 0) {
                setEmails(cached.sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0)));
                setLoading(false);
            }
        }).catch(err => console.log('Initial IndexedDB load:', err));

        // 2. Fetch fresh emails from backend once
        if (navigator.onLine) {
            fetchEmails(false);
        } else {
            setLoading(false);
        }

        // 3. Online / offline event listeners with automatic flush
        const handleOnlineStatus = async () => {
            setIsOnline(true);
            setReconnectingToast(true);
            console.log('🌐 Connection restored: flushing pending actions & resyncing');
            try {
                const syncRes = await flushPendingActions(SOCKET_URL);
                setPendingSyncCount(syncRes.pending || 0);
                await fetchEmails(true);
            } catch (err) {
                console.warn('Reconnection sync note:', err.message);
            } finally {
                setTimeout(() => setReconnectingToast(false), 4500);
            }
        };
        const handleOfflineStatus = () => {
            setIsOnline(false);
            setReconnectingToast(false);
            console.log('🔌 Offline mode: IndexedDB persistent storage active');
        };

        window.addEventListener('online', handleOnlineStatus);
        window.addEventListener('offline', handleOfflineStatus);

        return () => {
            isMounted = false;
            window.removeEventListener('online', handleOnlineStatus);
            window.removeEventListener('offline', handleOfflineStatus);
        };
    }, [user?.email, fetchEmails]);

    // ── Auto Background Sync (Every 15s when online) ─────────────
    useEffect(() => {
        if (!user?.email) return;
        const autoSyncInterval = setInterval(() => {
            if (navigator.onLine) {
                fetchEmails(true);
            }
        }, 15000);
        return () => clearInterval(autoSyncInterval);
    }, [user?.email, fetchEmails]);

    /* ── Persistent Socket.IO Listener ─────────────────────────── */
    useEffect(() => {
        if (!user?.email) return;

        const socket = getSocket();

        const handleConnect = () => {
            setIsConnected(true);
            socket.emit('join-room', user.email);
            console.log('⚡ [Socket] Connected & joined room for user:', user.email);
        };

        const handleReconnect = async () => {
            setIsConnected(true);
            socket.emit('join-room', user.email);
            console.log('⚡ [Socket] Reconnected: flushing actions & syncing');
            const syncRes = await flushPendingActions(SOCKET_URL);
            setPendingSyncCount(syncRes.pending || 0);
            fetchEmails(true);
        };

        const handleDisconnect = () => {
            setIsConnected(false);
            console.log('⚡ [Socket] Disconnected');
        };

        const handleNewEmail = async (rawEmail) => {
            if (!rawEmail) return;
            const normalizedCat = normalizeCategory(rawEmail.category);
            const email = {
                ...rawEmail,
                category: normalizedCat,
                id: rawEmail.id || rawEmail.gmailId || String(rawEmail._id),
                _id: String(rawEmail._id || rawEmail.gmailId || rawEmail.id),
                gmailId: rawEmail.gmailId || rawEmail.id || String(rawEmail._id),
                gmailMessageId: rawEmail.gmailMessageId || rawEmail.gmailId || rawEmail.id,
                receivedAt: rawEmail.receivedAt || rawEmail.timestamp || new Date().toISOString()
            };

            const emailKey = String(email.gmailMessageId || email.gmailId || email._id || email.id || '');
            const now = Date.now();
            const lastAlertTime = recentAlertsRef.current.get(emailKey) || 0;
            const isRecentAlert = emailKey && (now - lastAlertTime < 4000);

            // Persist into IndexedDB immediately
            await saveEmailToCache(email);

            // Update React state without duplicate
            setEmails(prev => {
                const existingIdx = prev.findIndex(e => 
                    (e.gmailMessageId && email.gmailMessageId && e.gmailMessageId === email.gmailMessageId) ||
                    (e.gmailId && email.gmailId && e.gmailId === email.gmailId) ||
                    (e._id && email._id && e._id === email._id) || 
                    (e.id && email.id && e.id === email.id)
                );
                let next;
                if (existingIdx >= 0) {
                    next = [...prev];
                    next[existingIdx] = { ...next[existingIdx], ...email };
                } else {
                    next = [email, ...prev];
                }
                return next.sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0));
            });

            // Suppress duplicate alert if fired recently or already notified in IndexedDB
            const alreadyNotified = await isEmailNotifiedLocal(emailKey);
            if (alreadyNotified || isRecentAlert) {
                return;
            }
            if (emailKey) {
                recentAlertsRef.current.set(emailKey, now);
                await recordEmailNotifiedLocal(emailKey);
            }

            const isImportant = isEmailHighPriority(email);
            const { pushAlert, playSynthesisSound, showDesktopNotification, notifSettings } = latestHandlersRef.current;
            
            // Trigger floating popup card
            pushAlert(email);

            // Play appropriate sound based on priority
            if (notifSettings.sound !== false) {
                if (isImportant) {
                    playSynthesisSound(notifSettings.importantSound || 'dual_bell');
                } else {
                    playSynthesisSound(notifSettings.normalSound || 'chime');
                }
            }

            // Trigger desktop push notification
            if (notifSettings.desktop !== false) {
                showDesktopNotification(email);
            }
        };

        if (socket.connected) {
            handleConnect();
        }

        socket.on('connect', handleConnect);
        socket.on('reconnect', handleReconnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('connect_error', handleDisconnect);
        socket.on('new_email', handleNewEmail);
        socket.on('new-email', handleNewEmail);

        return () => {
            socket.off('connect', handleConnect);
            socket.off('reconnect', handleReconnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('connect_error', handleDisconnect);
            socket.off('new_email', handleNewEmail);
            socket.off('new-email', handleNewEmail);
        };
    }, [user?.email, fetchEmails]);

    /* ── Send email ────────────────────────────────────────────── */
    const handleSendEmail = async (e) => {
        e.preventDefault();
        try {
            setComposeSending(true);
            const res = await axios.post(`${SOCKET_URL}/api/emails/send`, composeData, { withCredentials: true });
            if (res.data.success) {
                if (res.data.sentEmail) {
                    const sent = res.data.sentEmail;
                    await saveEmailToCache(sent);
                    setEmails(prev => [sent, ...prev.filter(e => e.gmailId !== sent.gmailId)]);
                }
                setComposeSent(true);
                setTimeout(() => {
                    setIsComposeOpen(false);
                    setComposeData({ to: '', subject: '', body: '' });
                    setComposeSent(false);
                }, 1200);
            }
        } catch (e) {
            console.error('send error:', e);
            alert('Could not send message. Please ensure you are online and connected with Google OAuth.');
        } finally {
            setComposeSending(false);
        }
    };

    /* ── Derived state & counts ────────────────────────────────── */
    const folderCounts = useMemo(() => ({
        inbox: emails.filter(e => !e.isArchived && !e.isTrash).length,
        starred: emails.filter(e => e.isStarred && !e.isTrash).length,
        important: emails.filter(e => (isEmailHighPriority(e) || e.priority === 'High' || e.priority === 'Critical') && !e.isTrash).length,
        archived: emails.filter(e => e.isArchived && !e.isTrash).length,
        trash: emails.filter(e => e.isTrash).length,
    }), [emails]);

    const folderUnreadCounts = useMemo(() => ({
        inbox: emails.filter(e => !e.isArchived && !e.isTrash && !e.isRead).length,
        starred: emails.filter(e => e.isStarred && !e.isTrash && !e.isRead).length,
        important: emails.filter(e => (isEmailHighPriority(e) || e.priority === 'High' || e.priority === 'Critical') && !e.isTrash && !e.isRead).length,
        archived: emails.filter(e => e.isArchived && !e.isTrash && !e.isRead).length,
        trash: emails.filter(e => e.isTrash && !e.isRead).length,
    }), [emails]);

    const categoryCounts = useMemo(() => {
        const pool = emails.filter(e => activeFolder === 'trash' ? e.isTrash : (!e.isTrash && (activeFolder === 'archived' ? e.isArchived : !e.isArchived)));
        return pool.reduce((acc, em) => {
            const cat = normalizeCategory(em.category);
            acc[cat] = (acc[cat] || 0) + 1;
            acc['All'] = (acc['All'] || 0) + 1;
            return acc;
        }, { All: 0, Primary: 0, Promotions: 0, Personal: 0, Finance: 0, 'College / Student': 0, Security: 0, Spam: 0, 'Other / Uncategorized': 0 });
    }, [emails, activeFolder]);

    const categoryUnreadCounts = useMemo(() => {
        const pool = emails.filter(e => !e.isRead && (activeFolder === 'trash' ? e.isTrash : (!e.isTrash && (activeFolder === 'archived' ? e.isArchived : !e.isArchived))));
        return pool.reduce((acc, em) => {
            const cat = normalizeCategory(em.category);
            acc[cat] = (acc[cat] || 0) + 1;
            acc['All'] = (acc['All'] || 0) + 1;
            return acc;
        }, { All: 0, Primary: 0, Promotions: 0, Personal: 0, Finance: 0, 'College / Student': 0, Security: 0, Spam: 0, 'Other / Uncategorized': 0 });
    }, [emails, activeFolder]);

    const unreadCount = useMemo(() =>
        emails.filter(e => !e.isRead && !e.isTrash && !e.isArchived).length,
        [emails]
    );

    const importantCount = useMemo(() =>
        emails.filter(e => (isEmailHighPriority(e) || e.priority === 'High' || e.priority === 'Critical') && !e.isTrash).length,
        [emails]
    );

    const actionRequiredCount = useMemo(() =>
        emails.filter(e => (e.requiresAction || (e.reminders && e.reminders.length > 0)) && !e.isTrash).length,
        [emails]
    );

    const filteredEmails = useMemo(() => {
        let list = emails;

        // 1. Folder filtering
        if (activeFolder === 'inbox') {
            list = list.filter(e => !e.isArchived && !e.isTrash);
        } else if (activeFolder === 'starred') {
            list = list.filter(e => e.isStarred && !e.isTrash);
        } else if (activeFolder === 'important') {
            list = list.filter(e => (isEmailHighPriority(e) || e.priority === 'High' || e.priority === 'Critical') && !e.isTrash);
        } else if (activeFolder === 'archived') {
            list = list.filter(e => e.isArchived && !e.isTrash);
        } else if (activeFolder === 'trash') {
            list = list.filter(e => e.isTrash);
        }

        // 2. Category filtering
        if (activeCategory !== 'All') {
            list = list.filter(e => normalizeCategory(e.category) === activeCategory);
        }

        // 3. Filter chips
        if (filterChip === 'unread') {
            list = list.filter(e => !e.isRead);
        } else if (filterChip === 'starred') {
            list = list.filter(e => e.isStarred);
        } else if (filterChip === 'important') {
            list = list.filter(e => isEmailHighPriority(e));
        } else if (filterChip === 'attachments') {
            list = list.filter(e => e.hasAttachments || (e.attachments && e.attachments.length > 0));
        } else if (filterChip === 'action') {
            list = list.filter(e => e.requiresAction || (e.reminders && e.reminders.length > 0));
        }

        // 4. Date filter
        if (selectedDate) {
            list = list.filter(e => {
                if (!e.receivedAt) return false;
                const mailDate = new Date(e.receivedAt);
                if (isNaN(mailDate.getTime())) return false;
                const year = mailDate.getFullYear();
                const month = String(mailDate.getMonth() + 1).padStart(2, '0');
                const day = String(mailDate.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}` === selectedDate;
            });
        }

        // 5. Search query
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(e =>
                e.subject?.toLowerCase().includes(q) ||
                e.from?.toLowerCase().includes(q) ||
                e.snippet?.toLowerCase().includes(q) ||
                e.text?.toLowerCase().includes(q) ||
                e.content?.toLowerCase().includes(q) ||
                e.category?.toLowerCase().includes(q) ||
                e.topic?.toLowerCase().includes(q) ||
                e.intent?.toLowerCase().includes(q) ||
                e.priority?.toLowerCase().includes(q) ||
                (Array.isArray(e.keywords) && e.keywords.some(k => (typeof k === 'string' ? k : (k.text || k.word))?.toLowerCase().includes(q))) ||
                (Array.isArray(e.keyPhrases) && e.keyPhrases.some(p => (typeof p === 'string' ? p : (p.text || p.word))?.toLowerCase().includes(q))) ||
                (Array.isArray(e.entities) && e.entities.some(ent => (ent.text || ent.value)?.toLowerCase().includes(q)))
            );
        }

        // 6. Sorting
        return [...list].sort((a, b) => {
            if (sortBy === 'newest') {
                return new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0);
            }
            if (sortBy === 'oldest') {
                return new Date(a.receivedAt || 0) - new Date(b.receivedAt || 0);
            }
            if (sortBy === 'unread_first') {
                if (a.isRead === b.isRead) return new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0);
                return a.isRead ? 1 : -1;
            }
            if (sortBy === 'sender') {
                const sA = (a.from || '').toLowerCase();
                const sB = (b.from || '').toLowerCase();
                return sA.localeCompare(sB);
            }
            if (sortBy === 'subject') {
                const subA = (a.subject || '').toLowerCase();
                const subB = (b.subject || '').toLowerCase();
                return subA.localeCompare(subB);
            }
            if (sortBy === 'priority') {
                const pMap = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
                const pA = pMap[a.priority] || (isEmailHighPriority(a) ? 3 : 0);
                const pB = pMap[b.priority] || (isEmailHighPriority(b) ? 3 : 0);
                if (pA === pB) return new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0);
                return pB - pA;
            }
            return 0;
        });
    }, [emails, activeFolder, activeCategory, filterChip, selectedDate, searchQuery, sortBy]);

    /* ── Render ────────────────────────────────────────────────── */
    return (
        <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden relative" style={{ fontFamily: "'Inter', sans-serif" }}>
            {/* Background Orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="orb-blue w-[40rem] h-[40rem] -top-20 -left-20" />
                <div className="orb-purple w-[40rem] h-[40rem] bottom-10 right-10" />
                <div className="orb-cyan w-[30rem] h-[30rem] top-1/2 left-1/3" />
            </div>

            {/* ════ Mobile Menu Backdrop Drawer ════ */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setMobileMenuOpen(false)}
                        className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-xs md:hidden"
                    />
                )}
            </AnimatePresence>

            {/* ════ Sidebar ════ */}
            <motion.aside
                animate={{ width: sidebarCollapsed ? 72 : 256 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className={`fixed md:relative inset-y-0 left-0 z-40 flex-shrink-0 flex flex-col overflow-hidden glass border-r border-white/60 transition-transform md:translate-x-0 ${
                    mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
                }`}
            >
                {/* Logo row */}
                <div className="flex items-center justify-between p-5 pb-4 border-b border-slate-100">
                    {!sidebarCollapsed && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex items-center gap-2.5"
                        >
                            <div className="p-2 rounded-xl bg-blue-600 shadow-md shadow-blue-500/30">
                                <Mail size={18} className="text-white" />
                            </div>
                            <div>
                                <span className="font-extrabold text-base text-slate-900 tracking-tight">LiveMail</span>
                                <span className="text-[10px] block font-bold text-blue-600 uppercase tracking-widest">Classifier</span>
                            </div>
                        </motion.div>
                    )}
                    <button
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-all ml-auto"
                    >
                        <ChevronDown
                            size={16}
                            style={{ transform: sidebarCollapsed ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform 0.25s' }}
                        />
                    </button>
                </div>

                {/* Compose button */}
                <div className="px-3 my-3">
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setIsComposeOpen(true)}
                        className="w-full font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 transition-all"
                    >
                        <Plus size={16} />
                        {!sidebarCollapsed && 'Compose'}
                    </motion.button>
                </div>

                {/* Navigation: Folders & Categories */}
                <nav className="flex-1 overflow-y-auto px-2 space-y-4">
                    {/* Folders List */}
                    <div className="space-y-1">
                        {!sidebarCollapsed && (
                            <p className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                Folders
                            </p>
                        )}
                        {FOLDERS.map((f) => {
                            const isActive = activeFolder === f.id;
                            const count = folderCounts[f.id] || 0;
                            const unread = folderUnreadCounts[f.id] || 0;
                            const Icon = f.icon;
                            return (
                                <button
                                    key={f.id}
                                    onClick={() => {
                                        setActiveFolder(f.id);
                                        setActiveCategory('All');
                                    }}
                                    title={sidebarCollapsed ? f.name : undefined}
                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 group relative ${
                                        isActive
                                            ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200/80 shadow-xs'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                                    }`}
                                >
                                    <Icon size={17} className={isActive ? 'text-blue-600' : 'text-slate-500'} />
                                    {!sidebarCollapsed && (
                                        <>
                                            <span className="text-sm flex-1 text-left">{f.name}</span>
                                            {unread > 0 ? (
                                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                                                    {unread}
                                                </span>
                                            ) : count > 0 ? (
                                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-500">
                                                    {count}
                                                </span>
                                            ) : null}
                                        </>
                                    )}
                                    {sidebarCollapsed && unread > 0 && (
                                        <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-blue-600 border-2 border-white" />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* AI Categories List */}
                    <div className="space-y-1 pt-2 border-t border-slate-200/60">
                        {!sidebarCollapsed && (
                            <p className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                Categories
                            </p>
                        )}
                        {CATEGORIES.map((cat) => {
                            const isActive = activeCategory === cat.name;
                            const count = categoryCounts[cat.name] || 0;
                            const unread = categoryUnreadCounts[cat.name] || 0;
                            const Icon = cat.icon;
                            return (
                                <button
                                    key={cat.name}
                                    onClick={() => setActiveCategory(cat.name)}
                                    title={sidebarCollapsed ? cat.name : undefined}
                                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-all duration-200 group relative ${
                                        isActive
                                            ? 'bg-slate-200/80 text-slate-900 font-semibold'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                                    }`}
                                >
                                    <Icon size={15} style={{ color: isActive ? cat.accent : '#64748b', flexShrink: 0 }} />
                                    {!sidebarCollapsed && (
                                        <>
                                            <span className="text-xs flex-1 text-left truncate">{cat.name}</span>
                                            {unread > 0 ? (
                                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800">
                                                    {unread}
                                                </span>
                                            ) : count > 0 ? (
                                                <span className="text-[9px] font-medium px-1.5 py-0.2 rounded-full bg-slate-200/70 text-slate-500">
                                                    {count}
                                                </span>
                                            ) : null}
                                        </>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Quick Tools in Sidebar */}
                    {!sidebarCollapsed && (
                        <div className="pt-2 border-t border-slate-200/60 space-y-1">
                            <button
                                onClick={() => setIsStorageModalOpen(true)}
                                className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 transition-all"
                            >
                                <HardDrive size={15} className="text-slate-400" />
                                <span>Storage & Offline Cache</span>
                            </button>

                        </div>
                    )}
                </nav>

                {/* User footer */}
                <div className="p-3 border-t border-slate-200 bg-white">
                    {!sidebarCollapsed ? (
                        <div className="flex items-center gap-3">
                            {user?.profilePicture ? (
                                <img
                                    src={user.profilePicture}
                                    alt=""
                                    className="w-9 h-9 rounded-full border border-blue-300"
                                />
                            ) : (
                                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                                    {getSenderInitials(user?.displayName || user?.email || 'User')}
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate text-slate-800">{user?.displayName || 'LiveMail User'}</p>
                                <p className="text-[10px] text-slate-500 truncate">{user?.email || 'user@example.com'}</p>
                            </div>
                            <button
                                onClick={logout}
                                className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors rounded-lg hover:bg-rose-50"
                                title="Sign out"
                            >
                                <LogOut size={16} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <button onClick={logout} className="p-1 text-slate-400 hover:text-rose-600 transition-colors" title="Sign out">
                                <LogOut size={16} />
                            </button>
                        </div>
                    )}
                </div>
            </motion.aside>

            {/* ════ Main ════ */}
            <main className="flex-1 flex flex-col min-w-0 relative bg-transparent z-10">

                {/* ── Topbar ── */}
                <header className="h-16 flex items-center justify-between gap-4 px-6 flex-shrink-0 z-20 glass-light border-b border-white/60">
                    {/* Mobile Menu Toggle Button */}
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="p-2 rounded-xl md:hidden text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all border border-slate-200"
                        title="Toggle Navigation Menu"
                    >
                        <Menu size={18} />
                    </button>

                    {/* Search & Date Filter */}
                    <div className="relative flex-1 max-w-lg group flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search
                                size={16}
                                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors"
                            />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder={`Search in ${activeFolder}... (Ctrl+K or /)`}
                                className="w-full py-2 pl-10 pr-16 rounded-xl text-sm outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 transition-all focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/50"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                                {!searchQuery && (
                                    <kbd className="hidden sm:inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-600">
                                        Ctrl+K
                                    </kbd>
                                )}
                            </div>
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors pointer-events-auto"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {/* Calendar Dropdown */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                                title="Filter by date"
                                className={`p-2 rounded-xl border flex items-center justify-center gap-2 text-sm transition-all duration-200
                                    ${selectedDate
                                        ? 'bg-blue-50 border-blue-300 text-blue-600 font-semibold'
                                        : 'bg-slate-100/80 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                                    }`}
                                style={{ height: 38, width: selectedDate ? 'auto' : 38 }}
                            >
                                <CalendarDays size={16} />
                                {selectedDate && (
                                    <span className="text-xs font-semibold pr-1">
                                        {new Date(selectedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </span>
                                )}
                            </button>
                            <AnimatePresence>
                                {isCalendarOpen && (
                                    <CalendarPopover
                                        emails={emails}
                                        selectedDate={selectedDate}
                                        onSelectDate={setSelectedDate}
                                        onSelectEmail={handleOpenEmail}
                                        onClose={() => setIsCalendarOpen(false)}
                                    />
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Right Tools & Honest Sync Status */}
                    <div className="flex items-center gap-2.5">
                        {/* Pending Offline Sync Badge */}
                        {pendingSyncCount > 0 && (
                            <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300" title="Changes made while offline queued for sync">
                                <RefreshCw size={11} className="animate-spin text-amber-600" />
                                {pendingSyncCount} pending sync
                            </span>
                        )}

                        {/* Honest Sync & Storage Status Badge */}
                        <div className="hidden sm:flex items-center">
                            {!isOnline ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-300 shadow-xs" title="Offline Mode: Viewing persistent IndexedDB cache">
                                    <WifiOff size={13} className="text-rose-600" />
                                    Offline (IndexedDB)
                                </span>
                            ) : isGoogleConnected && user?.googleId ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-xs" title="Connected to Google Gmail API">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    Gmail Synced
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-xs" title="Stored locally on this device & local backend database. Not synced to Gmail account.">
                                    <Database size={13} className="text-blue-600" />
                                    Local Database • Offline Ready
                                </span>
                            )}
                        </div>

                        {/* Sync / Refresh Button */}
                        <button
                            onClick={handleManualSync}
                            disabled={isRefreshing}
                            title="Sync emails with server & local IndexedDB"
                            className={`p-2 rounded-xl border transition-all active:scale-95 flex items-center gap-1.5 ${
                                syncStatusMsg?.type === 'error'
                                    ? 'text-rose-700 bg-rose-50 border-rose-200'
                                    : syncStatusMsg?.type === 'success' || syncSuccessMsg
                                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                    : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50 border-slate-200'
                            }`}
                        >
                            {syncStatusMsg ? (
                                <>
                                    {syncStatusMsg.type === 'error' ? (
                                        <AlertCircle size={16} className="text-rose-600 flex-shrink-0" />
                                    ) : (
                                        <Check size={16} className="text-emerald-600 flex-shrink-0" />
                                    )}
                                    <span className={`hidden md:inline text-xs font-bold ${syncStatusMsg.type === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}>
                                        {syncStatusMsg.text}
                                    </span>
                                </>
                            ) : syncSuccessMsg ? (
                                <>
                                    <Check size={16} className="text-emerald-600" />
                                    <span className="hidden md:inline text-xs font-bold text-emerald-700">✓ Synced</span>
                                </>
                            ) : (
                                <>
                                    <RefreshCw size={16} className={isRefreshing ? 'animate-spin text-blue-600' : ''} />
                                    <span className="hidden md:inline text-xs font-semibold">
                                        {isRefreshing ? 'Syncing...' : 'Sync'}
                                    </span>
                                </>
                            )}
                        </button>

                        {/* Theme Toggle Button */}
                        <button
                            onClick={() => setIsDarkMode(!isDarkMode)}
                            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all touch-target flex items-center justify-center"
                            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                        >
                            {isDarkMode ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} className="text-slate-600" />}
                        </button>

                        {/* Storage Modal Button */}
                        <button
                            onClick={() => setIsStorageModalOpen(true)}
                            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all"
                            title="Storage Usage & Offline Settings"
                        >
                            <HardDrive size={17} />
                        </button>

                        {/* Notification Settings Modal Button */}
                        <button
                            onClick={() => setIsNotifModalOpen(true)}
                            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all relative"
                            title="Notification & Sound Settings"
                        >
                            <Bell size={17} />
                            {activeAlerts.length > 0 && (
                                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                            )}
                        </button>
                    </div>
                </header>

                {/* ── Google Connect Suggestion Banner (Only if not linked) ── */}
                {authExpired && (
                    <div className="bg-amber-500/10 border-b border-amber-300/60 px-6 py-2.5 flex items-center justify-between text-xs font-medium text-amber-900 gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <AlertCircle size={16} className="text-amber-600 flex-shrink-0" />
                            <span className="truncate">
                                <strong>Local Offline Mode Active:</strong> Link your Google account to enable live background syncing with Gmail. Local database is fully functional.
                            </span>
                        </div>
                        <a
                            href={`${SOCKET_URL}/auth/google`}
                            className="px-3.5 py-1.5 rounded-xl font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-all flex items-center gap-1.5 flex-shrink-0"
                        >
                            <Sparkles size={13} />
                            Connect Google Account
                        </a>
                    </div>
                )}

                {/* ── Offline Banner Warning & Reconnection Banner ── */}
                {!isOnline ? (
                    <div className="bg-amber-500/15 dark:bg-amber-950/40 border-b border-amber-300 dark:border-amber-800 px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between text-xs font-medium text-amber-900 dark:text-amber-300 gap-2 transition-all" role="status">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <WifiOff size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                            <span className="leading-normal">
                                <strong>You're offline:</strong> Displaying cached emails saved on this device. New mail cannot be fetched without an internet connection.
                                {pendingSyncCount > 0 && ` (${pendingSyncCount} queued action${pendingSyncCount > 1 ? 's' : ''} to sync)`}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[11px] font-bold text-amber-800 dark:text-amber-200 bg-amber-200/70 dark:bg-amber-900/60 px-2.5 py-1 rounded-lg">
                                Offline Device Cache Active
                            </span>
                        </div>
                    </div>
                ) : reconnectingToast ? (
                    <div className="bg-emerald-500/15 dark:bg-emerald-950/40 border-b border-emerald-300 dark:border-emerald-800 px-4 sm:px-6 py-2 flex items-center justify-between text-xs font-medium text-emerald-900 dark:text-emerald-300 transition-all" role="status">
                        <div className="flex items-center gap-2.5">
                            <RefreshCw size={14} className="text-emerald-600 dark:text-emerald-400 animate-spin" />
                            <span><strong>Connection Restored:</strong> Flushing queued offline changes & syncing mailbox with server...</span>
                        </div>
                        <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">Syncing...</span>
                    </div>
                ) : null}

                {/* ── Email List Content ── */}
                <div className="flex-1 overflow-y-auto p-6 bg-transparent">
                    <div className="max-w-5xl mx-auto space-y-5">

                        {/* KPI Metric Overview */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="p-3.5 rounded-2xl glass-light border border-white/60 shadow-2xs glowing-card hover:scale-[1.02] transition-transform">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Inbox Total</span>
                                <div className="flex items-center justify-between">
                                    <span className="text-xl font-black text-slate-900">{folderCounts.inbox}</span>
                                    <div className="p-1.5 rounded-xl bg-blue-50 text-blue-600"><Mail size={16} /></div>
                                </div>
                            </div>
                            <div className="p-3.5 rounded-2xl glass-light border border-white/60 shadow-2xs glowing-card hover:scale-[1.02] transition-transform">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Unread</span>
                                <div className="flex items-center justify-between">
                                    <span className="text-xl font-black text-blue-600">{unreadCount}</span>
                                    <div className="p-1.5 rounded-xl bg-blue-50 text-blue-600"><Inbox size={16} /></div>
                                </div>
                            </div>
                            <div className="p-3.5 rounded-2xl glass-light border border-white/60 shadow-2xs glowing-card hover:scale-[1.02] transition-transform">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">High Priority</span>
                                <div className="flex items-center justify-between">
                                    <span className="text-xl font-black text-amber-600">{importantCount}</span>
                                    <div className="p-1.5 rounded-xl bg-amber-50 text-amber-600"><Star size={16} /></div>
                                </div>
                            </div>
                            <div className="p-3.5 rounded-2xl glass-light border border-white/60 shadow-2xs glowing-card hover:scale-[1.02] transition-transform">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Action Required</span>
                                <div className="flex items-center justify-between">
                                    <span className="text-xl font-black text-rose-600">{actionRequiredCount}</span>
                                    <div className="p-1.5 rounded-xl bg-rose-50 text-rose-600"><Zap size={16} /></div>
                                </div>
                            </div>
                        </div>

                        {/* Controls Bar: Filter Chips & Sorting */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl glass-light border border-white/60 shadow-2xs">
                            {/* Filter Chips */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {[
                                    { id: 'all', label: 'All Messages' },
                                    { id: 'unread', label: 'Unread' },
                                    { id: 'starred', label: '⭐ Starred' },
                                    { id: 'important', label: '✦ Important' },
                                    { id: 'attachments', label: '📎 Attachments' },
                                    { id: 'action', label: '⚡ Action Required' },
                                ].map((chip) => (
                                    <button
                                        key={chip.id}
                                        onClick={() => setFilterChip(chip.id)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                            filterChip === chip.id
                                                ? 'bg-blue-600 text-white shadow-xs'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                                        }`}
                                    >
                                        {chip.label}
                                    </button>
                                ))}
                            </div>

                            {/* Sorting Dropdown */}
                            <div className="flex items-center gap-2 self-end sm:self-auto">
                                <ArrowDownUp size={14} className="text-slate-400" />
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="text-xs p-1.5 px-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-700 outline-none focus:border-blue-500 cursor-pointer"
                                >
                                    <option value="newest">Sort: Newest First</option>
                                    <option value="oldest">Sort: Oldest First</option>
                                    <option value="unread_first">Sort: Unread First</option>
                                    <option value="sender">Sort: Sender Name (A-Z)</option>
                                    <option value="subject">Sort: Subject (A-Z)</option>
                                    <option value="priority">Sort: High Priority First</option>
                                </select>
                            </div>
                        </div>

                        {/* List Header */}
                        <div className="flex items-center justify-between pb-1">
                            <div>
                                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <span>
                                        {activeFolder === 'inbox' && '📥 Inbox'}
                                        {activeFolder === 'starred' && '⭐ Starred'}
                                        {activeFolder === 'important' && '✦ Important'}
                                        {activeFolder === 'archived' && '📦 Archived'}
                                        {activeFolder === 'trash' && '🗑️ Trash'}
                                        {activeCategory !== 'All' && ` • ${activeCategory}`}
                                    </span>
                                    <span className="text-xs font-bold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
                                        {filteredEmails.length}
                                    </span>
                                </h2>
                                <p className="text-xs text-slate-500">
                                    {searchQuery ? `Filtering by "${searchQuery}"` : 'Stored locally in IndexedDB & synchronized with server'}
                                </p>
                            </div>

                            {searchQuery && (
                                <button
                                    onClick={() => {
                                        setSearchQuery('');
                                        setSelectedDate(null);
                                    }}
                                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                >
                                    <X size={12} /> Clear filters
                                </button>
                            )}
                        </div>

                        {/* Email Cards / Empty States */}
                        {loading ? (
                            <div className="space-y-3">
                                {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} i={i} />)}
                            </div>
                        ) : filteredEmails.length === 0 ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex flex-col items-center justify-center py-20 rounded-3xl border-2 border-dashed border-slate-200 bg-white"
                            >
                                <div className="p-5 rounded-full mb-3 bg-blue-50 text-blue-500 shadow-sm">
                                    {activeFolder === 'starred' ? <Star size={36} /> : activeFolder === 'trash' ? <Trash2 size={36} /> : activeFolder === 'archived' ? <Archive size={36} /> : <Inbox size={36} />}
                                </div>
                                <h3 className="text-base font-bold text-slate-800 mb-1">
                                    {searchQuery
                                        ? 'No matching emails found'
                                        : activeFolder === 'starred'
                                        ? 'No starred messages'
                                        : activeFolder === 'trash'
                                        ? 'Trash is empty'
                                        : activeFolder === 'archived'
                                        ? 'Archive is empty'
                                        : activeFolder === 'important'
                                        ? 'No high priority messages'
                                        : 'Your inbox is clear!'}
                                </h3>
                                <p className="text-xs text-slate-500 text-center max-w-sm">
                                    {searchQuery
                                        ? `No stored messages match "${searchQuery}". Try clearing search.`
                                        : activeFolder === 'starred'
                                        ? 'Click the star icon on any email to save it here for quick access.'
                                        : activeFolder === 'trash'
                                        ? 'Deleted emails will be kept here until permanently removed.'
                                        : activeFolder === 'archived'
                                        ? 'Archive messages to keep your inbox organized without losing them.'
                                        : 'All caught up! New incoming emails will appear here live.'}
                                </p>
                            </motion.div>
                        ) : (
                            <AnimatePresence mode="popLayout">
                                <div className="space-y-2.5">
                                    {filteredEmails.map((email, index) => {
                                        const cat = getCategoryConfig(normalizeCategory(email.category));
                                        const isImportant = isEmailHighPriority(email);
                                        const emailId = email._id || email.gmailId || email.id;

                                        return (
                                            <motion.div
                                                layout
                                                key={emailId}
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.97 }}
                                                transition={{ delay: Math.min(index * 0.02, 0.25) }}
                                                onClick={() => handleOpenEmail(email)}
                                                className={`group cursor-pointer rounded-2xl p-4 relative overflow-hidden bg-white border shadow-xs hover:shadow-md transition-all duration-200 ${
                                                    email.isRead ? 'border-slate-200/90' : 'border-blue-300 bg-blue-50/20 shadow-blue-500/5 ring-1 ring-blue-100'
                                                }`}
                                            >
                                                <div
                                                    className="absolute left-0 top-0 bottom-0 rounded-l-2xl"
                                                    style={{ width: 4, background: isImportant ? '#f59e0b' : cat.accent }}
                                                />
                                                <div className="flex items-start gap-3.5 pl-2">
                                                    {/* Sender Avatar */}
                                                    <div className="relative flex-shrink-0">
                                                        <div
                                                            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-xs select-none shadow-sm"
                                                            style={{
                                                                background: isImportant
                                                                    ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                                                                    : `linear-gradient(135deg, ${getSenderColor(email.from)} 0%, ${getSenderColor(email.from)}cc 100%)`,
                                                            }}
                                                        >
                                                            {isImportant ? '⭐' : getSenderInitials(email.from)}
                                                        </div>
                                                        <div
                                                            className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white"
                                                            style={{ background: cat.dot }}
                                                            title={normalizeCategory(email.category)}
                                                        />
                                                    </div>

                                                    {/* Content */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2 mb-1">
                                                            <div className="flex items-center gap-2 truncate">
                                                                <span className={`text-sm truncate transition-colors ${email.isRead ? 'font-semibold text-slate-700' : 'font-black text-slate-900 group-hover:text-blue-600'}`}>
                                                                    {email.from?.split('<')[0].trim() || email.from}
                                                                </span>
                                                                {!email.isRead && (
                                                                    <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" title="Unread" />
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                                {isImportant && (
                                                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-xs">
                                                                        ⭐ IMPORTANT
                                                                    </span>
                                                                )}
                                                                {email.requiresAction && (
                                                                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-0.5 shadow-2xs">
                                                                        <Zap size={9} /> ACTION
                                                                    </span>
                                                                )}
                                                                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${cat.badge}`}>
                                                                    {normalizeCategory(email.category)}
                                                                </span>
                                                                {email.categoryCorrectedByUser && (
                                                                    <span
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleUndoCategoryCorrection(email);
                                                                        }}
                                                                        title="User modified classification. Click to revert."
                                                                        className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 flex items-center gap-1"
                                                                    >
                                                                        ✦ Adjusted <Undo size={9} />
                                                                    </span>
                                                                )}
                                                                {email.hasAttachments && (
                                                                    <span title={navigator.onLine ? "Contains attachments" : "Contains attachments (may not be downloaded)"} className={`text-slate-400 ${!navigator.onLine ? 'opacity-50' : ''}`}>
                                                                        <Paperclip size={12} />
                                                                    </span>
                                                                )}
                                                                <span title="Saved offline on device" className="text-emerald-500">
                                                                    <Database size={12} />
                                                                </span>
                                                                <span className="text-[11px] text-slate-400 font-medium">
                                                                    {formatTime(email.receivedAt)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <h4 className={`text-sm mb-1 truncate ${email.isRead ? 'font-medium text-slate-800' : 'font-bold text-slate-900'}`}>
                                                            {email.subject || '(No Subject)'}
                                                        </h4>
                                                        <p className="text-xs text-slate-500 line-clamp-1 leading-relaxed mb-1.5">
                                                            {email.snippet || email.text || email.content || '(No content preview)'}
                                                        </p>
                                                    </div>

                                                    {/* Quick Actions (Star, Read/Unread, Archive, Trash, Category Menu) */}
                                                    <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                                        {/* Star Button */}
                                                        <button
                                                            onClick={(e) => handleToggleStar(email, e)}
                                                            className={`p-1.5 rounded-lg transition-all ${
                                                                email.isStarred
                                                                    ? 'text-amber-500 hover:bg-amber-50'
                                                                    : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'
                                                            }`}
                                                            title={email.isStarred ? 'Unstar' : 'Star'}
                                                        >
                                                            <Star size={15} fill={email.isStarred ? 'currentColor' : 'none'} />
                                                        </button>

                                                        {/* Read/Unread Toggle Button */}
                                                        <button
                                                            onClick={() => handleMarkAsRead(emailId, true)}
                                                            className={`p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100 ${
                                                                email.isRead
                                                                    ? 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                                                                    : 'text-blue-600 hover:bg-blue-50'
                                                            }`}
                                                            title={email.isRead ? 'Mark as unread' : 'Mark as read'}
                                                        >
                                                            <CheckSquare size={14} />
                                                        </button>

                                                        {/* Archive / Unarchive Button */}
                                                        {activeFolder === 'archived' ? (
                                                            <button
                                                                onClick={(e) => handleUnarchive(email, e)}
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all"
                                                                title="Restore to Inbox"
                                                            >
                                                                <Inbox size={14} />
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={(e) => handleArchive(email, e)}
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all"
                                                                title="Archive message"
                                                            >
                                                                <Archive size={14} />
                                                            </button>
                                                        )}

                                                        {/* Trash / Restore Button */}
                                                        {activeFolder === 'trash' ? (
                                                            <>
                                                                <button
                                                                    onClick={(e) => handleRestore(email, e)}
                                                                    className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 opacity-0 group-hover:opacity-100 transition-all"
                                                                    title="Restore to Inbox"
                                                                >
                                                                    <RotateCcw size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => handleTrash(email, e)}
                                                                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all"
                                                                    title="Delete permanently"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={(e) => handleTrash(email, e)}
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all"
                                                                title="Move to Trash"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}

                                                        {/* Move Category Selector Dropdown */}
                                                        <div className="relative">
                                                            <button
                                                                onClick={() => setCategoryMenuOpenForId(categoryMenuOpenForId === emailId ? null : emailId)}
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-all"
                                                                title="Change Category"
                                                            >
                                                                <Tag size={14} />
                                                            </button>
                                                            {categoryMenuOpenForId === emailId && (
                                                                <div className="absolute right-0 top-8 z-30 w-44 rounded-2xl bg-white border border-slate-200 shadow-xl p-1.5 space-y-0.5">
                                                                    <p className="px-2 py-1 text-[10px] font-extrabold uppercase text-slate-400">
                                                                        Classify into:
                                                                    </p>
                                                                    {['Primary', 'Promotions', 'Personal', 'Finance', 'College / Student', 'Security', 'Spam'].map((catName) => (
                                                                        <button
                                                                            key={catName}
                                                                            onClick={() => handleChangeCategory(email, catName, 'User selected category')}
                                                                            className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center justify-between"
                                                                        >
                                                                            <span>{catName}</span>
                                                                            {normalizeCategory(email.category) === catName && (
                                                                                <Check size={12} className="text-blue-600" />
                                                                            )}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <ChevronRight
                                                            size={16}
                                                            className="text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all"
                                                        />
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </AnimatePresence>
                        )}
                    </div>
                </div>

                {/* ── Top-Right Mail Notification Popup Stack ── */}
                <div className="fixed top-6 right-6 z-[99999] flex flex-col gap-3 pointer-events-none max-w-sm w-full">
                    <AnimatePresence>
                        {activeAlerts.map((alert) => (
                            <LiveNotificationCard
                                key={alert._alertId || alert._id || alert.gmailId || alert.id}
                                alert={alert}
                                privacy={notifSettings.privacy}
                                onOpen={(em) => {
                                    setActiveCategory(normalizeCategory(em.category));
                                    handleOpenEmail(em);
                                    removeAlert(em._alertId || em._id || em.gmailId || em.id);
                                }}
                                onMarkRead={handleMarkAsRead}
                                onDismiss={removeAlert}
                            />
                        ))}
                    </AnimatePresence>
                </div>

                {/* ════ Notification & Sound Settings Modal ════ */}
                <AnimatePresence>
                    {isNotifModalOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
                            onClick={(e) => e.target === e.currentTarget && setIsNotifModalOpen(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, y: 16 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.95, y: 16 }}
                                className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-slate-800"
                            >
                                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                                            <Bell size={18} />
                                        </div>
                                        <div>
                                            <h3 className="font-extrabold text-sm text-slate-900">Notification & Sound Settings</h3>
                                            <p className="text-[11px] text-slate-500 font-medium">Real-time alerts & sound customization</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsNotifModalOpen(false)}
                                        className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-all"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                <div className="p-5 max-h-[70vh] overflow-y-auto space-y-4">
                                    {/* Desktop Notifications Banner */}
                                    <div className="p-3.5 rounded-2xl bg-blue-50/80 border border-blue-200/80 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-base">🔔</span>
                                                <div>
                                                    <p className="text-xs font-bold text-slate-900">Desktop Push Notifications</p>
                                                    <p className="text-[10px] text-slate-600">Native system alerts on incoming mail</p>
                                                </div>
                                            </div>
                                            {desktopPerm === 'granted' ? (
                                                <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                    ✓ Permission Granted
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={requestDesktopNotificationPermission}
                                                    className="px-3 py-1 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all"
                                                >
                                                    Enable Desktop Alerts
                                                </button>
                                            )}
                                        </div>
                                        {desktopPerm !== 'granted' && (
                                            <p className="text-[10px] text-amber-800 bg-amber-100/80 p-2 rounded-xl font-medium border border-amber-200 flex items-center gap-1.5">
                                                <span>⚠️</span>
                                                Desktop notification permission is not granted. Floating in-app notification cards will be delivered as fallback alerts.
                                            </p>
                                        )}
                                    </div>

                                    {/* Master Sound & Popup Toggles */}
                                    <div className="space-y-2.5">
                                        {/* Notification Privacy Setting */}
                                        <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                                    <ShieldCheck size={14} className="text-blue-600" />
                                                    Notification Privacy
                                                </label>
                                                <span className="text-[10px] text-slate-500 font-medium">Screen privacy</span>
                                            </div>
                                            <select
                                                value={notifSettings.privacy || 'full'}
                                                onChange={(e) => updateNotifSetting('privacy', e.target.value)}
                                                className="w-full text-xs p-2 rounded-xl bg-white border border-slate-200 font-bold text-slate-800 outline-none focus:border-blue-500 cursor-pointer"
                                            >
                                                <option value="full">Full Details (Sender, Subject & Snippet)</option>
                                                <option value="sender_subject">Sender & Subject Only (Snippet Hidden)</option>
                                                <option value="private">Private Alert ("New Message" - Content Hidden)</option>
                                            </select>
                                        </div>

                                        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                                            <div>
                                                <p className="text-xs font-bold text-slate-800">In-App Floating Popups</p>
                                                <p className="text-[10px] text-slate-500">Show floating cards in top-right corner</p>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={notifSettings.popup !== false}
                                                onChange={(e) => updateNotifSetting('popup', e.target.checked)}
                                                className="w-4 h-4 text-blue-600 rounded cursor-pointer accent-blue-600"
                                            />
                                        </div>

                                        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                                            <div>
                                                <p className="text-xs font-bold text-slate-800">🔊 Notification Sounds</p>
                                                <p className="text-[10px] text-slate-500">Play audio chime on new mail</p>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={notifSettings.sound !== false}
                                                onChange={(e) => updateNotifSetting('sound', e.target.checked)}
                                                className="w-4 h-4 text-blue-600 rounded cursor-pointer accent-blue-600"
                                            />
                                        </div>
                                    </div>

                                    {/* Sound Selection & Testing */}
                                    <div className="space-y-3 pt-2 border-t border-slate-100">
                                        {/* Normal Sound Selector */}
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-slate-700 block">Normal Email Sound</label>
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={notifSettings.normalSound || 'chime'}
                                                    onChange={(e) => updateNotifSetting('normalSound', e.target.value)}
                                                    className="flex-1 text-xs p-2 rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-800 outline-none focus:border-blue-500"
                                                >
                                                    <option value="chime">Chime (Corporate Two-Tone)</option>
                                                    <option value="harp">Harp (Soft Chord)</option>
                                                    <option value="pop">Pop (Subtle Bubbly)</option>
                                                    <option value="soft_bell">Soft Bell (Pure Tone)</option>
                                                </select>
                                                <button
                                                    onClick={() => playSynthesisSound(notifSettings.normalSound || 'chime')}
                                                    className="px-3 py-2 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all flex items-center gap-1"
                                                >
                                                    <Play size={12} fill="currentColor" /> Test
                                                </button>
                                            </div>
                                        </div>

                                        {/* Important Sound Selector */}
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                                                <span>⭐ Important Email Sound</span>
                                                <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded">Priority Alert</span>
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={notifSettings.importantSound || 'dual_bell'}
                                                    onChange={(e) => updateNotifSetting('importantSound', e.target.value)}
                                                    className="flex-1 text-xs p-2 rounded-xl bg-amber-50/50 border border-amber-200 font-medium text-slate-800 outline-none focus:border-amber-500"
                                                >
                                                    <option value="dual_bell">Dual Bell (Resonant Chime)</option>
                                                    <option value="urgent_ping">Urgent Alert Ping (Crisp Double-Tap)</option>
                                                    <option value="siren">Siren (Attention Sweep)</option>
                                                    <option value="executive">Executive (Harmonic Fanfare)</option>
                                                </select>
                                                <button
                                                    onClick={() => playSynthesisSound(notifSettings.importantSound || 'dual_bell')}
                                                    className="px-3 py-2 rounded-xl text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 transition-all flex items-center gap-1"
                                                >
                                                    <Play size={12} fill="currentColor" /> Test
                                                </button>
                                            </div>
                                        </div>

                                        {/* Volume Slider */}
                                        <div className="space-y-1.5 pt-2">
                                            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                                                <span>Volume</span>
                                                <span className="text-slate-500">{Math.round((notifSettings.volume ?? 0.6) * 100)}%</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <Volume2 size={16} className="text-slate-400" />
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="1"
                                                    step="0.05"
                                                    value={notifSettings.volume ?? 0.6}
                                                    onChange={(e) => updateNotifSetting('volume', parseFloat(e.target.value))}
                                                    className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Test Live Card Trigger */}
                                    <div className="pt-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const testItem = {
                                                    _id: 'test-preview-' + Date.now(),
                                                    gmailId: 'test-preview-' + Date.now(),
                                                    from: 'Security Center <security-alerts@livemail.org>',
                                                    fromName: 'Security Center',
                                                    fromAddress: 'security-alerts@livemail.org',
                                                    subject: '⭐ Immediate Action: Critical Account Update',
                                                    snippet: 'Your verification settings have been updated. Click open to inspect or read to dismiss.',
                                                    category: 'Security',
                                                    isImportant: true,
                                                    priority: 'URGENT',
                                                    receivedAt: new Date().toISOString()
                                                };
                                                pushAlert(testItem);
                                                playSynthesisSound(notifSettings.importantSound || 'dual_bell');
                                                showDesktopNotification(testItem);
                                            }}
                                            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-blue-700 bg-blue-50/80 hover:bg-blue-100 border border-blue-200 transition-all flex items-center justify-center gap-2 active:scale-98"
                                        >
                                            <Play size={13} fill="currentColor" />
                                            Trigger Sample Live Notification Card
                                        </button>
                                    </div>

                                    {/* Save confirmation */}
                                    <div className="pt-3 border-t border-slate-100 flex justify-end">
                                        <button
                                            onClick={() => setIsNotifModalOpen(false)}
                                            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-500/20 transition-all"
                                        >
                                            Done
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ════ Storage Manager Modal ════ */}
                <AnimatePresence>
                    {isStorageModalOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
                            onClick={(e) => e.target === e.currentTarget && setIsStorageModalOpen(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, y: 16 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.95, y: 16 }}
                                className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-slate-800"
                            >
                                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                                            <HardDrive size={18} />
                                        </div>
                                        <div>
                                            <h3 className="font-extrabold text-sm text-slate-900">Offline Storage & Cache</h3>
                                            <p className="text-[11px] text-slate-500 font-medium">Local IndexedDB persistence details</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsStorageModalOpen(false)}
                                        className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-all"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                <div className="p-5 space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                                Cached Emails
                                            </span>
                                            <p className="text-xl font-black text-slate-900">
                                                {storageStats.emailCount || emails.length}
                                            </p>
                                            <span className="text-[10px] text-slate-500">Persistent locally</span>
                                        </div>
                                        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                                Pending Changes
                                            </span>
                                            <p className="text-xl font-black text-blue-600">
                                                {pendingSyncCount}
                                            </p>
                                            <span className="text-[10px] text-slate-500">Queued for sync</span>
                                        </div>
                                    </div>

                                    {storageStats.usageMb !== null && (
                                        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                                            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                                                <span>Browser Storage Used</span>
                                                <span>{storageStats.usageMb} MB {storageStats.quotaMb ? `/ ${storageStats.quotaMb} MB` : ''}</span>
                                            </div>
                                            {storageStats.quotaMb && (
                                                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-blue-600 rounded-full"
                                                        style={{ width: `${Math.min(100, Math.round((parseFloat(storageStats.usageMb) / parseFloat(storageStats.quotaMb)) * 100))}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Account Connections</h4>
                                        {user?.connectedAccounts && user.connectedAccounts.length > 0 ? (
                                            <div className="space-y-2">
                                                {user.connectedAccounts.map((acc, idx) => (
                                                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-2 h-2 rounded-full ${acc.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                            <span className="text-xs font-bold text-slate-800">{acc.email}</span>
                                                        </div>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${acc.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                                            {acc.status === 'active' ? 'Healthy Sync' : 'Sync Error'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                                                    <span className="text-xs font-bold text-slate-800">Local Database Only</span>
                                                </div>
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                                                    Offline Ready
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200/70 text-xs text-blue-900 space-y-1">
                                        <p className="font-bold flex items-center gap-1.5">
                                            <ShieldCheck size={14} className="text-blue-600" />
                                            Data Storage & Sync
                                        </p>
                                        <p className="text-[11px] leading-relaxed text-blue-800">
                                            Messages are stored locally on this device for offline access. Changes you make (read, archive, etc.) are applied instantly and queued for synchronization to your email provider when connected.
                                        </p>
                                    </div>

                                    <div className="pt-2 flex flex-col gap-2">
                                        <div className="flex items-center justify-between gap-3 mb-2 pb-2 border-b border-slate-100">
                                            <button
                                                onClick={async () => {
                                                    const success = await exportEmailsToJSON();
                                                    if (success) triggerUndoToast('Emails exported successfully.');
                                                }}
                                                className="flex-1 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all flex items-center justify-center gap-1.5"
                                            >
                                                <HardDrive size={13} />
                                                Export Backup
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (window.confirm("Permanently wipe all local offline data? You will need to re-sync with Google upon next login.")) {
                                                        await wipeAllLocalData();
                                                        window.location.reload();
                                                    }
                                                }}
                                                className="flex-1 px-3.5 py-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all flex items-center justify-center gap-1.5"
                                            >
                                                <Trash2 size={13} />
                                                Wipe Data
                                            </button>
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <button
                                                onClick={async () => {
                                                    const pruned = await pruneCache(50);
                                                    alert(`Cleaned up cache: ${pruned} old messages pruned. Starred and important emails are always preserved.`);
                                                    const usage = await getStorageUsageEstimate();
                                                    setStorageStats(usage);
                                                }}
                                                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all flex items-center gap-1.5"
                                            >
                                                <Trash2 size={13} />
                                                Prune Old Cache
                                            </button>
                                            <button
                                                onClick={() => setIsStorageModalOpen(false)}
                                                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all"
                                            >
                                                Close
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>



                {/* ════ Floating Undo Toast ════ */}
                <AnimatePresence>
                    {undoToast && (
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 15, scale: 0.95 }}
                            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[99999] flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-900 text-white shadow-2xl border border-slate-700"
                        >
                            <span className="text-xs font-semibold">{undoToast.message}</span>
                            {undoToast.onUndo && (
                                <button
                                    onClick={() => {
                                        undoToast.onUndo();
                                        setUndoToast(null);
                                    }}
                                    className="px-3 py-1 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-500 text-white transition-all flex items-center gap-1 shadow-sm active:scale-95"
                                >
                                    <Undo size={12} />
                                    Undo
                                </button>
                            )}
                            <button
                                onClick={() => setUndoToast(null)}
                                className="text-slate-400 hover:text-white p-1"
                            >
                                <X size={14} />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ════ Email Detail Modal (Offline-First Viewer) ════ */}
                <AnimatePresence>
                    {selectedEmail && (() => {
                        const cat = getCategoryConfig(normalizeCategory(selectedEmail.category));
                        const isImportant = isEmailHighPriority(selectedEmail);
                        const sanitizedHtml = selectedEmail.html ? DOMPurify.sanitize(selectedEmail.html) : '';

                        return (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm"
                                onClick={(e) => e.target === e.currentTarget && setSelectedEmail(null)}
                            >
                                <motion.div
                                    initial={{ scale: 0.94, y: 20 }}
                                    animate={{ scale: 1, y: 0 }}
                                    exit={{ scale: 0.94, y: 20 }}
                                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                    className="w-full max-w-3xl max-h-[88vh] rounded-3xl flex flex-col overflow-hidden bg-white border border-slate-200 shadow-2xl text-slate-800"
                                >
                                    {/* Modal header */}
                                    <div className="flex items-center justify-between px-6 py-4 flex-shrink-0 border-b border-slate-100 bg-slate-50/50">
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => setSelectedEmail(null)}
                                                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-all"
                                            >
                                                <X size={18} />
                                            </button>
                                            <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full ${cat.badge}`}>
                                                {normalizeCategory(selectedEmail.category)}
                                            </span>
                                            {isImportant && (
                                                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                                                    ⭐ Important
                                                </span>
                                            )}
                                            {!isOnline && (
                                                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                                                    Stored Offline
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={(e) => handleToggleStar(selectedEmail, e)}
                                                className={`p-2 rounded-full transition-all ${
                                                    selectedEmail.isStarred
                                                        ? 'text-amber-500 bg-amber-50'
                                                        : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'
                                                }`}
                                                title={selectedEmail.isStarred ? 'Starred' : 'Star'}
                                            >
                                                <Star size={17} fill={selectedEmail.isStarred ? 'currentColor' : 'none'} />
                                            </button>
                                            <button
                                                onClick={() => deleteEmail(selectedEmail)}
                                                className="p-2 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                                                title="Delete email"
                                            >
                                                <Trash2 size={17} />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setComposeData({
                                                        to: selectedEmail.from,
                                                        subject: `Re: ${selectedEmail.subject}`,
                                                        body: `\n\n─── Original message ───\nFrom: ${selectedEmail.from}\nDate: ${new Date(selectedEmail.receivedAt || Date.now()).toLocaleString()}\n\n`,
                                                    });
                                                    setSelectedEmail(null);
                                                    setIsComposeOpen(true);
                                                }}
                                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all"
                                            >
                                                <Reply size={14} />
                                                Reply
                                            </button>
                                        </div>
                                    </div>

                                    {/* Email body */}
                                    <div className="flex-1 overflow-y-auto p-7 bg-white">
                                        <h1 className="text-2xl font-black text-slate-900 mb-5 leading-tight">
                                            {selectedEmail.subject || '(No Subject)'}
                                        </h1>

                                        {/* Sender & Receiver Card */}
                                        <div className="flex items-center gap-4 mb-6 p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                                            <div
                                                className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0 shadow-sm"
                                                style={{
                                                    background: isImportant
                                                        ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                                                        : `linear-gradient(135deg, ${getSenderColor(selectedEmail.from)} 0%, ${getSenderColor(selectedEmail.from)}cc 100%)`,
                                                }}
                                            >
                                                {isImportant ? '⭐' : getSenderInitials(selectedEmail.from)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-slate-900 text-sm truncate">{selectedEmail.from}</p>
                                                <p className="text-xs text-slate-500">To: {selectedEmail.to || 'me'}</p>
                                                {selectedEmail.cc && <p className="text-[11px] text-slate-400">CC: {selectedEmail.cc}</p>}
                                            </div>
                                            <div className="text-xs text-slate-500 font-medium text-right flex-shrink-0">
                                                {selectedEmail.receivedAt ? new Date(selectedEmail.receivedAt).toLocaleString([], {
                                                    month: 'short', day: 'numeric',
                                                    hour: '2-digit', minute: '2-digit'
                                                }) : 'Received'}
                                            </div>
                                        </div>

                                        {/* AI Intelligence & Insights Panel */}
                                        <AIInsightsPanel email={selectedEmail} />

                                        {/* AI Reminders Panel */}
                                        <ReminderPanel email={selectedEmail} />

                                        {/* AI Smart Replies Widget */}
                                        <SmartRepliesWidget
                                            email={selectedEmail}
                                            onSelectReply={(replyBody) => {
                                                setComposeData({
                                                    to: selectedEmail.from,
                                                    subject: `Re: ${selectedEmail.subject || ''}`,
                                                    body: `${replyBody}\n\n─── Original message ───\nFrom: ${selectedEmail.from}\nDate: ${new Date(selectedEmail.receivedAt || Date.now()).toLocaleString()}\n\n${selectedEmail.text || selectedEmail.snippet || ''}`
                                                });
                                                setSelectedEmail(null);
                                                setIsComposeOpen(true);
                                            }}
                                        />

                                        {/* Attachments Section if present */}
                                        {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                                            <div className="mb-6 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Paperclip size={15} className="text-blue-600" />
                                                    <span className="text-xs font-bold text-slate-800">
                                                        Attachments ({selectedEmail.attachments.length})
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    {selectedEmail.attachments.map((att, ai) => (
                                                        <div key={ai} className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-slate-200">
                                                            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                                                                <Paperclip size={14} />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-xs font-semibold text-slate-800 truncate">{att.filename}</p>
                                                                <p className="text-[10px] text-slate-400">
                                                                    {att.size ? `${(att.size / 1024).toFixed(1)} KB` : att.mimeType}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* HTML / Plain-text body with DOMPurify sanitization */}
                                        {sanitizedHtml ? (
                                            <div
                                                className="bg-white rounded-2xl p-5 border border-slate-100 text-slate-800 overflow-hidden"
                                                style={{ minHeight: 100 }}
                                                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                                            />
                                        ) : (
                                            <div
                                                className="rounded-2xl p-5 bg-slate-50 border border-slate-200/70 text-slate-700 text-sm leading-7"
                                                style={{
                                                    fontFamily: 'inherit',
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word',
                                                    minHeight: 80,
                                                }}
                                            >
                                                {(selectedEmail.text || selectedEmail.content || selectedEmail.snippet || '(No content available)')
                                                    .split('\n')
                                                    .map((line, li) => {
                                                        const urlRegex = /(https?:\/\/[^\s]+)/g;
                                                        const parts = line.split(urlRegex);
                                                        return (
                                                            <span key={li}>
                                                                {parts.map((part, pi) =>
                                                                    urlRegex.test(part) ? (
                                                                        <a
                                                                            key={pi}
                                                                            href={part}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="text-blue-600 hover:text-blue-700 underline break-all"
                                                                        >
                                                                            {part}
                                                                        </a>
                                                                    ) : (
                                                                        <span key={pi}>{part}</span>
                                                                    )
                                                                )}
                                                                {'\n'}
                                                            </span>
                                                        );
                                                    })}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            </motion.div>
                        );
                    })()}
                </AnimatePresence>

                {/* ════ Compose Modal ════ */}
                <AnimatePresence>
                    {isComposeOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-6 bg-slate-900/40 backdrop-blur-sm"
                            onClick={e => e.target === e.currentTarget && setIsComposeOpen(false)}
                        >
                            <motion.div
                                initial={{ y: '100%' }}
                                animate={{ y: 0 }}
                                exit={{ y: '100%' }}
                                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                                className="w-full max-w-2xl rounded-t-3xl md:rounded-3xl overflow-hidden bg-white border border-slate-200 shadow-2xl"
                            >
                                <form onSubmit={handleSendEmail}>
                                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                                        <h3 className="font-extrabold text-base text-slate-900">New Message</h3>
                                        <button
                                            type="button"
                                            onClick={() => setIsComposeOpen(false)}
                                            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-all"
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                    <div className="p-6 space-y-3 bg-white">
                                        <input
                                            type="email"
                                            placeholder="To"
                                            required
                                            value={composeData.to}
                                            onChange={e => setComposeData({ ...composeData, to: e.target.value })}
                                            className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Subject"
                                            required
                                            value={composeData.subject}
                                            onChange={e => setComposeData({ ...composeData, subject: e.target.value })}
                                            className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                                        />
                                        <textarea
                                            placeholder="Write your message..."
                                            required
                                            rows={8}
                                            value={composeData.body}
                                            onChange={e => setComposeData({ ...composeData, body: e.target.value })}
                                            className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:bg-white focus:border-blue-500 outline-none resize-none transition-all"
                                        />
                                    </div>
                                    <div className="px-6 pb-6 flex items-center justify-between bg-white">
                                        <button
                                            type="button"
                                            onClick={() => setIsComposeOpen(false)}
                                            className="text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors"
                                        >
                                            Discard
                                        </button>
                                        <motion.button
                                            type="submit"
                                            disabled={composeSending || composeSent}
                                            whileHover={{ scale: 1.03 }}
                                            whileTap={{ scale: 0.97 }}
                                            className="flex items-center gap-2 px-7 py-2.5 rounded-full font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/25 transition-all"
                                        >
                                            {composeSent ? (
                                                <>
                                                    <CheckCircle2 size={16} />
                                                    Sent!
                                                </>
                                            ) : composeSending ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    Sending...
                                                </>
                                            ) : (
                                                <>
                                                    <Send size={16} />
                                                    Send
                                                </>
                                            )}
                                        </motion.button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
};

export default Dashboard;
