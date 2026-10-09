import React from 'react';

const CategoryStats = ({ stats = {} }) => {
    const categories = [
        { name: 'Primary', color: 'bg-blue-600', lightColor: 'bg-blue-100 dark:bg-blue-950/60', textColor: 'text-blue-700 dark:text-blue-300' },
        { name: 'Personal', color: 'bg-emerald-500', lightColor: 'bg-emerald-100 dark:bg-emerald-950/60', textColor: 'text-emerald-700 dark:text-emerald-300' },
        { name: 'Finance', color: 'bg-amber-500', lightColor: 'bg-amber-100 dark:bg-amber-950/60', textColor: 'text-amber-700 dark:text-amber-300' },
        { name: 'College / Student', color: 'bg-cyan-500', lightColor: 'bg-cyan-100 dark:bg-cyan-950/60', textColor: 'text-cyan-700 dark:text-cyan-300' },
        { name: 'Security', color: 'bg-rose-500', lightColor: 'bg-rose-100 dark:bg-rose-950/60', textColor: 'text-rose-700 dark:text-rose-300' },
        { name: 'Spam', color: 'bg-red-500', lightColor: 'bg-red-100 dark:bg-red-950/60', textColor: 'text-red-700 dark:text-red-300' },
        { name: 'Other / Uncategorized', color: 'bg-slate-500', lightColor: 'bg-slate-100 dark:bg-slate-800', textColor: 'text-slate-700 dark:text-slate-300' }
    ];

    const totalEmails = Object.values(stats).reduce((sum, count) => sum + count, 0);

    const getPercentage = (count) => {
        if (totalEmails === 0) return 0;
        return Math.round((count / totalEmails) * 100);
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-800 p-5 transition-colors">
            <h2 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-4">
                Category Distribution
            </h2>

            <div className="space-y-3">
                {categories.map((category) => {
                    const count = stats[category.name] || 0;
                    const percentage = getPercentage(count);

                    return (
                        <div key={category.name} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2.5 h-2.5 rounded-full ${category.color}`} />
                                    <span className="text-slate-700 dark:text-slate-300 font-bold">{category.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-slate-900 dark:text-slate-100 font-extrabold">{count}</span>
                                    <span className="text-slate-400 dark:text-slate-500 text-[11px]">({percentage}%)</span>
                                </div>
                            </div>

                            {/* Progress bar */}
                            <div className={`w-full h-2 ${category.lightColor} rounded-full overflow-hidden`}>
                                <div
                                    className={`h-full ${category.color} rounded-full transition-all duration-500 ease-out`}
                                    style={{ width: `${percentage}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Total count summary */}
            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Total Classified</span>
                    <span className="text-base font-black text-slate-900 dark:text-slate-100">{totalEmails}</span>
                </div>
            </div>
        </div>
    );
};

export default CategoryStats;