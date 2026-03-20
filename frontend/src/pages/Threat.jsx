import { useKinetixData } from '../hooks/useKinetixData';

export default function Threat() {
    const { data: events, loading } = useKinetixData('events', { limit: 20 });

    const getVerdictColor = (verdict) => {
        if (verdict.includes('THREAT')) return 'danger';
        if (verdict.includes('ANOMALY')) return 'warning';
        return 'primary';
    };

    return (
        <main className="flex-1 mt-24 px-8 pb-12 max-w-[1440px] mx-auto w-full">
            {/* Professional Filter Control Center */}
            <div className="flex flex-col lg:flex-row gap-6 mb-8 items-stretch justify-between">
                <div className="premium-glass rounded-2xl p-2.5 flex flex-wrap items-center gap-3 flex-1">
                    <div className="flex items-center gap-2.5 px-3 py-1.5 bg-white/5 rounded-xl border border-white/5">
                        <span className="material-symbols-outlined text-primary text-lg">tune</span>
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Filters</span>
                    </div>
                    {/* Specific Filter Options */}
                    <div className="flex flex-wrap items-center gap-2">
                        <button className="px-3.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-[11px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5 transition-all hover:bg-primary/20">
                            <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>
                            New
                        </button>
                        <button className="px-3.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-slate-400 uppercase tracking-wider hover:text-white hover:bg-white/10 transition-all">
                            Known
                        </button>
                        <button className="px-3.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-slate-400 uppercase tracking-wider hover:text-white hover:bg-white/10 transition-all">
                            FP
                        </button>
                        <button className="px-3.5 py-1.5 rounded-lg bg-danger/10 border border-danger/20 text-[11px] font-bold text-danger uppercase tracking-wider hover:bg-danger/20 transition-all">
                            DDoS
                        </button>
                        <button className="px-3.5 py-1.5 rounded-lg bg-accent-purple/10 border border-accent-purple/20 text-[11px] font-bold text-accent-purple uppercase tracking-wider hover:bg-accent-purple/20 transition-all">
                            MISP
                        </button>
                        <div className="w-px h-6 bg-white/10 mx-1"></div>
                        <button className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-[13px] font-medium text-slate-300 flex items-center gap-2 transition-all">
                            Time Range <span className="material-symbols-outlined text-base opacity-50">expand_more</span>
                        </button>
                        <button className="px-4 py-2 text-slate-400 hover:text-white text-[13px] font-medium transition-colors">Reset</button>
                    </div>
                    <div className="ml-auto hidden md:flex items-center gap-3 pr-4">
                        <div className="flex items-center gap-2 py-1 px-3 bg-success/10 border border-success/20 rounded-full">
                            <span className="relative flex size-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                                <span className="relative inline-flex rounded-full size-2 bg-success"></span>
                            </span>
                            <span className="text-[11px] font-bold text-success uppercase tracking-wider">Live System</span>
                        </div>
                    </div>
                </div>
                {/* Modern Export Button */}
                <div className="shrink-0 flex items-center">
                    <button className="micro-glow-btn px-8 py-3.5 bg-gradient-to-br from-primary to-primary/80 text-white rounded-2xl font-bold flex items-center justify-center gap-2.5 hover:shadow-[0_0_20px_rgba(37,106,244,0.3)] hover:-translate-y-0.5 transition-all h-full">
                        <span className="material-symbols-outlined text-[20px]">ios_share</span>
                        <span>Export Report</span>
                    </button>
                </div>
            </div>
            {/* High-Fidelity Threat Table Container */}
            <div className="premium-glass rounded-3xl overflow-hidden">
                <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                    <div className="flex items-center gap-4">
                        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                            <span className="material-symbols-outlined text-primary">analytics</span>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold tracking-tight text-white">Live Threat Intelligence</h2>
                            <p className="text-[11px] text-slate-500 font-medium uppercase tracking-[0.2em] mt-0.5">Real-time heuristic analysis</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                            <span className="size-1 bg-slate-500 rounded-full"></span>
                            LAST UPDATED
                        </div>
                        <span className="text-sm font-mono text-primary/80 tabular-nums">12:04:32.410</span>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white/[0.01]">
                                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em]">Timestamp</th>
                                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em]">Event Intelligence</th>
                                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em]">Alert Type</th>
                                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em]">Origin Node</th>
                                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em]">Anomaly Analysis</th>
                                <th className="px-8 py-5 text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] text-right">Operations</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                            {events.map((event, idx) => (
                                <tr key={event._id || idx} className="hover:bg-white/[0.04] transition-all group">
                                    <td className="px-8 py-6">
                                        <div className="text-[13px] font-semibold text-white mb-0.5">{new Date(event.timestamp * 1000).toLocaleDateString()}</div>
                                        <div className="text-[11px] font-mono text-slate-500">{new Date(event.timestamp * 1000).toLocaleTimeString()}</div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-3">
                                            <div className={`size-2 rounded-full bg-${getVerdictColor(event.verdict)} shadow-[0_0_8px_rgba(var(--color-${getVerdictColor(event.verdict)}),0.6)]`}></div>
                                            <span className="text-[14px] font-bold text-slate-200">{event.verdict}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className={`px-3 py-1 rounded-full bg-${getVerdictColor(event.verdict)}/10 border border-${getVerdictColor(event.verdict)}/20 text-[10px] font-bold text-${getVerdictColor(event.verdict)} uppercase tracking-wider`}>
                                            {event.verdict.split(' ').pop()}
                                        </span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className="px-3 py-1.5 rounded-lg bg-white/5 text-[11px] font-bold text-slate-400 border border-white/5 uppercase tracking-wider">{event.host_id || 'Unknown'}</span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-4 w-48">
                                            <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 p-[1px]">
                                                <div className={`h-full rounded-full liquid-neon-${getVerdictColor(event.verdict)}`} style={{ width: `${Math.min(100, (event.score || 0) * 10)}%` }}></div>
                                            </div>
                                            <span className={`text-[13px] font-bold text-${getVerdictColor(event.verdict)} w-8 text-right`}>{Math.round((event.score || 0) * 10)}%</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-primary hover:text-white text-primary text-[13px] font-bold transition-all border border-transparent hover:border-primary/20">
                                            Details
                                            <span className="material-symbols-outlined text-[16px]">arrow_forward_ios</span>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {events.length === 0 && !loading && (
                                <tr>
                                    <td colSpan="6" className="px-8 py-20 text-center text-slate-500 text-sm">
                                        No threat intelligence data received yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="px-8 py-5 border-t border-white/5 bg-white/[0.01] flex items-center justify-between">
                    <div className="text-[12px] font-medium text-slate-500">
                        Analyzing <span className="text-slate-300 font-bold">1,536</span> global events in current buffer
                    </div>
                    <div className="flex gap-2">
                        <button className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors">
                            <span className="material-symbols-outlined">chevron_left</span>
                        </button>
                        <button className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors">
                            <span className="material-symbols-outlined">chevron_right</span>
                        </button>
                    </div>
                </div>
            </div>
        </main>
    );
}
