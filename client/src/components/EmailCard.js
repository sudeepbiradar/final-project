import React from 'react';
import { Star, HardDrive } from 'lucide-react';

const EmailCard = ({ email, categoryColor, isSelected, onClick }) => {
    const formatTime = (timestamp) => {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const truncateText = (text, maxLength = 130) => {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    };

    const getCategoryBadgeClass = (category) => {
        const classes = {
            'Primary': 'badge-primary',
            'Personal': 'badge-personal',
            'Finance': 'badge-finance',
            'College / Student': 'badge-college',
            'Security': 'badge-security',
            'Spam': 'badge-spam',
            'Promotions': 'badge-promotions',
            'Other / Uncategorized': 'badge-default'
        };
        return classes[category] || 'badge-default';
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (onClick) onClick();
        }
    };

    return (
        <div
            onClick={onClick}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            role="option"
            aria-selected={!!isSelected}
            aria-label={`Email from ${email.from || email.sender || 'Unknown'}: ${email.subject || 'No Subject'}`}
            className={`email-card rounded-2xl border transition-all cursor-pointer p-3.5 sm:p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 relative ${
                isSelected
                    ? 'bg-blue-50/90 dark:bg-blue-950/50 border-blue-500 dark:border-blue-400 shadow-md ring-2 ring-blue-500/20'
                    : email.isRead === false
                        ? 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 shadow-xs font-semibold'
                        : 'bg-slate-50/50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 opacity-90 hover:opacity-100'
            }`}
        >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 flex-wrap">
                        {/* Unread indicator dot */}
                        {!email.isRead && (
                            <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 flex-shrink-0" title="Unread Message" />
                        )}

                        <span className={`text-[11px] sm:text-xs font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${getCategoryBadgeClass(email.category)}`}>
                            {email.category}
                        </span>

                        {email.isImportant && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 flex items-center gap-1">
                                <Star size={10} className="fill-amber-500 text-amber-500" />
                                Important
                            </span>
                        )}

                        {email.confidence && (
                            <span className="text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                                ({Math.round(email.confidence * 100)}% match)
                            </span>
                        )}

                        <span className="sm:hidden ml-auto text-[10px] font-medium text-slate-400 dark:text-slate-500 flex-shrink-0">
                            {formatTime(email.timestamp || email.date || email.receivedAt)}
                        </span>
                    </div>

                    <h3 className={`text-sm truncate mb-1 leading-snug ${!email.isRead ? 'font-black text-slate-900 dark:text-slate-100' : 'font-bold text-slate-800 dark:text-slate-200'}`}>
                        {email.subject || '(No Subject)'}
                    </h3>

                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5 truncate">
                        From: <span className="font-semibold text-slate-700 dark:text-slate-300">{email.from || email.sender || 'Unknown'}</span>
                    </p>

                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed break-words-clean">
                        {truncateText(email.content || email.snippet || email.body || '', 140)}
                    </p>
                </div>

                <div className="hidden sm:flex flex-shrink-0 text-right flex-col items-end gap-1">
                    <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                        {formatTime(email.timestamp || email.date || email.receivedAt)}
                    </p>
                    <span title="Saved locally on device for offline access" className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                        <HardDrive size={10} /> Cached
                    </span>
                </div>
            </div>
        </div>
    );
};

export default EmailCard;