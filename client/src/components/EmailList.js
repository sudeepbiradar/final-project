import React from 'react';
import EmailCard from './EmailCard';
import { Inbox, WifiOff, HardDrive } from 'lucide-react';

const EmailList = ({ emails, selectedEmail, onSelectEmail, loading = false, isOnline = true, activeFolder = 'inbox', searchQuery = '' }) => {
    // Skeleton loader during loading state
    if (loading) {
        return (
            <div className="space-y-3" role="status" aria-label="Loading emails">
                <div className="flex items-center justify-between px-1 mb-2">
                    <div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                </div>
                {[1, 2, 3, 4].map(idx => (
                    <div key={idx} className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 animate-pulse">
                        <div className="flex justify-between items-center">
                            <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                            <div className="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
                        </div>
                        <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-800 rounded" />
                        <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-800 rounded" />
                        <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded" />
                    </div>
                ))}
            </div>
        );
    }

    // Empty states for online vs offline mode
    if (!emails || emails.length === 0) {
        return (
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-800 p-8 sm:p-12 text-center transition-colors">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800/80 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400 dark:text-slate-500 shadow-inner">
                    {!isOnline ? <WifiOff size={32} className="text-amber-500 dark:text-amber-400" /> : <Inbox size={32} />}
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1.5 flex items-center justify-center gap-2">
                    {!isOnline ? "No Cached Messages Offline" : "No Messages Found"}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-xs max-w-md mx-auto leading-relaxed mb-3">
                    {!isOnline ? (
                        <>
                            You are currently offline. Offline access displays messages previously saved on this device for <strong>{activeFolder}</strong>. 
                            New mail cannot be fetched until internet connection is restored.
                        </>
                    ) : searchQuery ? (
                        <>No emails matching search query <strong>"{searchQuery}"</strong>.</>
                    ) : (
                        <>There are no emails in <strong>{activeFolder}</strong> matching your criteria.</>
                    )}
                </p>
                {!isOnline && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-300 text-xs font-semibold">
                        <HardDrive size={13} />
                        Messages will sync automatically when reconnected
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between px-1 mb-2">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-2">
                    <span>Messages ({emails.length})</span>
                    {!isOnline && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700 normal-case">
                            Offline Device Cache
                        </span>
                    )}
                </h2>
            </div>

            <div className="space-y-2.5" role="listbox" aria-label="Email message list">
                {emails.map((email, index) => (
                    <EmailCard
                        key={email._id || email.gmailId || email.id || index}
                        email={email}
                        isSelected={selectedEmail && (selectedEmail._id === email._id || selectedEmail.id === email.id || selectedEmail.gmailId === email.gmailId)}
                        onClick={() => onSelectEmail && onSelectEmail(email)}
                    />
                ))}
            </div>
        </div>
    );
};

export default EmailList;