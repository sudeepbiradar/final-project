import React from 'react';
import { Mail, Wifi, WifiOff, Clock, Layers, RefreshCw } from 'lucide-react';

const Header = ({ isConnected, isOnline = true, pendingSyncCount = 0, totalEmails = 0, lastUpdated }) => {
    const formatTime = (timestamp) => {
        if (!timestamp) return 'N/A';
        return new Date(timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    return (
        <header className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 sm:p-5 transition-colors" role="banner">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                {/* Logo and Title */}
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 dark:bg-blue-500 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/20 flex-shrink-0">
                        <Mail size={22} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                            LiveMail Classifier
                            {!isOnline && (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                    Offline Mode
                                </span>
                            )}
                        </h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            {isOnline 
                                ? "AI-Powered Real-time Email Inbox" 
                                : "Viewing Local Device Cache (Offline)"}
                        </p>
                    </div>
                </div>

                {/* Status Indicators */}
                <div className="flex items-center gap-3 sm:gap-4 flex-wrap" role="status" aria-live="polite">
                    {/* Connection Status */}
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                        isOnline && isConnected 
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400' 
                            : isOnline 
                                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
                                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                    }`}>
                        {isOnline ? (
                            <>
                                <Wifi size={14} className="text-emerald-600 dark:text-emerald-400 animate-pulse" />
                                <span>{isConnected ? 'Live Connected' : 'Online'}</span>
                            </>
                        ) : (
                            <>
                                <WifiOff size={14} className="text-amber-600 dark:text-amber-400" />
                                <span>Offline (Cached Data)</span>
                            </>
                        )}
                    </div>

                    {/* Pending Sync Count Badge */}
                    {pendingSyncCount > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-300 text-xs font-bold shadow-xs animate-bounce" title="Actions performed offline queued for sync">
                            <RefreshCw size={13} className="animate-spin" />
                            <span>{pendingSyncCount} queued action{pendingSyncCount > 1 ? 's' : ''}</span>
                        </div>
                    )}

                    {/* Total Emails */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
                        <Layers size={14} className="text-slate-400 dark:text-slate-500" />
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            {totalEmails} {isOnline ? 'messages' : 'cached emails'}
                        </span>
                    </div>

                    {/* Last Updated */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
                        <Clock size={14} className="text-slate-400 dark:text-slate-500" />
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            Synced: {formatTime(lastUpdated)}
                        </span>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;