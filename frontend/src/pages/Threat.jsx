import React, { useState, useEffect, useCallback } from 'react';
import { useKinetixData } from '../hooks/useKinetixData';
import './Threat.css';

const TIME_RANGES = {
    '15m': { label: 'Last 15m', seconds: 15 * 60 },
    '1h': { label: 'Last 1 hour', seconds: 60 * 60 },
    '24h': { label: 'Last 24 hours', seconds: 24 * 60 * 60 },
    '7d': { label: 'Last 7 days', seconds: 7 * 24 * 60 * 60 },
    'All': { label: 'All Time', seconds: 0 }
};

export default function Threat() {
    const [activeFilters, setActiveFilters] = useState([]); // Empty = All
    const [timeRange, setTimeRange] = useState('All');
    const [isTimeDropdownOpen, setTimeDropdownOpen] = useState(false);
    const [cutoff, setCutoff] = useState(0);
    const [selectedEvent, setSelectedEvent] = useState(null);

    useEffect(() => {
        if (timeRange === 'All') {
            setCutoff(0);
        } else {
            setCutoff((Date.now() / 1000) - TIME_RANGES[timeRange].seconds);
        }
    }, [timeRange]);

    const toggleFilter = (filter) => {
        setActiveFilters(prev => {
            if (prev.includes(filter)) return prev.filter(f => f !== filter);
            return [...prev, filter];
        });
    };

    const isActive = (filter) => activeFilters.includes(filter);

    // Build optimized server-side query with Time Range
    const baseFilter = {};
    if (cutoff > 0) {
        baseFilter.timestamp = { $gte: cutoff };
    }

    const eventQueryFilter = { ...baseFilter, status: 'active' };
    const eventVerdicts = [];
    if (isActive('New')) eventVerdicts.push('NEW ANOMALY');
    if (isActive('Known')) eventVerdicts.push('KNOWN THREAT');
    if (isActive('FP')) eventVerdicts.push('FALSE POSITIVE');
    if (isActive('MISP')) eventVerdicts.push('Known Threat (MISP)');

    if (eventVerdicts.length > 0) {
        eventQueryFilter.verdict = { $in: eventVerdicts };
    }

    const ddosQueryFilter = { ...baseFilter };

    // Fetch from both collections seamlessly
    const { data: rawEvents, loading: eventsLoading } = useKinetixData('events', { filter: eventQueryFilter, limit: 50 });
    const { data: rawDdos, loading: ddosLoading } = useKinetixData('ddos', { filter: ddosQueryFilter, limit: 50 });

    const loading = eventsLoading || ddosLoading;

    // Merge, sort, and strict filter for real-time stream stability
    const allData = [...rawEvents, ...rawDdos.map(d => ({ ...d, verdict: d.verdict || 'DDoS' }))];
    allData.sort((a, b) => b.timestamp - a.timestamp);

    const events = allData.filter(e => {
        if (timeRange !== 'All' && e.timestamp < cutoff) return false;

        if (e.verdict !== 'DDoS' && e.status !== 'active') return false;

        if (activeFilters.length === 0) return true; // Show all active if none selected

        if (isActive('New') && e.verdict === 'NEW ANOMALY') return true;
        if (isActive('Known') && e.verdict === 'KNOWN THREAT') return true;
        if (isActive('FP') && e.verdict === 'FALSE POSITIVE') return true;
        if (isActive('MISP') && (e.verdict === 'Known Threat (MISP)' || e.misp_hit)) return true;
        if (isActive('DDoS') && e.verdict === 'DDoS') return true;

        return false;
    }).slice(0, 50);

    const getVerdictStyles = (verdict) => {
        if (!verdict) return { dot: 'bg-primary/50', badge: 'bg-primary/10 border-primary/20 text-primary', bar: 'liquid-neon-primary', text: 'text-primary' };
        if (verdict.includes('THREAT') || verdict.includes('DDoS')) return {
            dot: 'bg-danger shadow-[0_0_8px_rgba(var(--color-danger),0.6)]',
            badge: 'bg-danger/10 border-danger/20 text-danger',
            bar: 'liquid-neon-danger',
            text: 'text-danger'
        };
        if (verdict.includes('ANOMALY')) return {
            dot: 'bg-warning shadow-[0_0_8px_rgba(var(--color-warning),0.6)]',
            badge: 'bg-warning/10 border-warning/20 text-warning',
            bar: 'liquid-neon-warning',
            text: 'text-warning'
        };
        return {
            dot: 'bg-primary shadow-[0_0_8px_rgba(var(--color-primary),0.6)]',
            badge: 'bg-primary/10 border-primary/20 text-primary',
            bar: 'liquid-neon-primary',
            text: 'text-primary'
        };
    };

    const exportCSV = useCallback(() => {
        if (events.length === 0) return;

        const headers = ['Date', 'Time', 'Verdict', 'Severity Score', 'Host ID', 'MISP Hit', 'Status'];
        const rows = events.map(e => [
            new Date(e.timestamp * 1000).toLocaleDateString(),
            new Date(e.timestamp * 1000).toLocaleTimeString(),
            e.verdict || '',
            Math.round((e.score || 0) * 10) + '%',
            e.host_id || 'Unknown',
            e.misp_hit ? 'Yes' : 'No',
            e.status || 'active'
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `kinetix_threats_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [events]);

    return (
        <main className="flex-1 mt-24 px-8 pb-12 max-w-[1440px] mx-auto w-full space-y-6">
            {/* ─── Page Header ─── */}
            <div className="flex items-center justify-end gap-3">
                <div className="flex items-center gap-2 py-1.5 px-4 bg-success/10 border border-success/20 rounded-full">
                    <span className="relative flex size-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                        <span className="relative inline-flex rounded-full size-2 bg-success"></span>
                    </span>
                    <span className="text-[11px] font-bold text-success uppercase tracking-wider">Live</span>
                </div>
                <button onClick={exportCSV} className="micro-glow-btn px-6 py-2.5 bg-gradient-to-br from-primary to-primary/80 text-white rounded-xl font-bold flex items-center gap-2 hover:shadow-[0_0_20px_rgba(37,106,244,0.3)] hover:-translate-y-0.5 transition-all text-sm">
                    <span className="material-symbols-outlined text-[18px]">ios_share</span>
                    Export
                </button>
            </div>

            {/* ─── Quick Stats ─── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="premium-glass rounded-2xl p-5 border border-white/5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="size-9 rounded-xl bg-warning/10 flex items-center justify-center">
                            <span className="material-symbols-outlined text-warning text-lg">new_releases</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">New Anomalies</span>
                    </div>
                    <div className="text-2xl font-black text-white tabular-nums">
                        {events.filter(e => e.verdict === 'NEW ANOMALY').length}
                    </div>
                </div>
                <div className="premium-glass rounded-2xl p-5 border border-white/5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="size-9 rounded-xl bg-danger/10 flex items-center justify-center">
                            <span className="material-symbols-outlined text-danger text-lg">gpp_bad</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Known Threats</span>
                    </div>
                    <div className="text-2xl font-black text-white tabular-nums">
                        {events.filter(e => e.verdict === 'KNOWN THREAT').length}
                    </div>
                </div>
                <div className="premium-glass rounded-2xl p-5 border border-white/5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
                            <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">False Positives</span>
                    </div>
                    <div className="text-2xl font-black text-white tabular-nums">
                        {events.filter(e => e.verdict === 'FALSE POSITIVE').length}
                    </div>
                </div>
                <div className="premium-glass rounded-2xl p-5 border border-white/5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="size-9 rounded-xl bg-accent-purple/10 flex items-center justify-center">
                            <span className="material-symbols-outlined text-accent-purple text-lg">dns</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">DDoS Events</span>
                    </div>
                    <div className="text-2xl font-black text-white tabular-nums">
                        {events.filter(e => e.verdict === 'DDoS').length}
                    </div>
                </div>
            </div>

            {/* ─── Filter Bar ─── */}
            <div className="premium-glass rounded-2xl p-3 flex flex-wrap items-center gap-2">
                {[
                    { key: 'New', icon: 'fiber_new', color: 'warning' },
                    { key: 'Known', icon: 'warning', color: 'danger' },
                    { key: 'FP', icon: 'verified', color: 'primary' },
                    { key: 'DDoS', icon: 'bolt', color: 'danger' },
                    { key: 'MISP', icon: 'share', color: 'accent-purple' },
                ].map(({ key, icon, color }) => (
                    <button
                        key={key}
                        onClick={() => toggleFilter(key)}
                        className={`px-4 py-2 rounded-xl border text-[11px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all duration-200 ${isActive(key)
                            ? `bg-${color}/15 border-${color}/30 text-${color} shadow-[0_0_12px_rgba(var(--color-${color}),0.2)]`
                            : 'bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] hover:border-white/10'
                            }`}
                    >
                        {isActive(key) && <span className="size-1.5 rounded-full bg-current animate-pulse"></span>}
                        <span className="material-symbols-outlined text-[16px]">{icon}</span>
                        {key}
                    </button>
                ))}

                <div className="w-px h-6 bg-white/10 mx-1"></div>

                {/* Time Range Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setTimeDropdownOpen(!isTimeDropdownOpen)}
                        className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all font-bold tracking-wider text-[11px] uppercase border ${timeRange !== 'All'
                            ? 'bg-primary/15 border-primary/30 text-primary shadow-[0_0_12px_rgba(var(--color-primary),0.2)]'
                            : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.06] text-slate-500 hover:text-slate-200'
                            }`}
                    >
                        {timeRange !== 'All' && <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>}
                        <span className="material-symbols-outlined text-[16px]">schedule</span>
                        {TIME_RANGES[timeRange].label}
                        <span className="material-symbols-outlined text-sm opacity-40">expand_more</span>
                    </button>
                    {isTimeDropdownOpen && (
                        <div className="absolute top-full right-0 mt-2 w-44 premium-glass rounded-xl border border-white/10 overflow-hidden z-50 shadow-2xl">
                            {Object.entries(TIME_RANGES).map(([key, config]) => (
                                <button
                                    key={key}
                                    onClick={() => { setTimeRange(key); setTimeDropdownOpen(false); }}
                                    className={`w-full text-left px-4 py-2.5 text-[11px] font-bold tracking-wider uppercase transition-colors flex items-center gap-2.5 ${timeRange === key ? 'bg-primary/10 text-primary' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                        }`}
                                >
                                    {timeRange === key
                                        ? <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>
                                        : <span className="size-1.5 rounded-full bg-transparent"></span>
                                    }
                                    {config.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {(activeFilters.length > 0 || timeRange !== 'All') && (
                    <button
                        onClick={() => { setActiveFilters([]); setTimeRange('All'); setTimeDropdownOpen(false); }}
                        className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-white transition-colors flex items-center gap-1.5"
                    >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                        Clear
                    </button>
                )}
            </div>

            {/* ─── Threat Table ─── */}
            <div className="premium-glass rounded-3xl overflow-hidden border border-white/[0.04]">
                {/* Table Header */}
                <div className="px-8 py-5 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-white/[0.02] to-transparent">
                    <div className="flex items-center gap-4">
                        <div className="size-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
                            <span className="material-symbols-outlined text-primary">shield</span>
                        </div>
                        <div>
                            <h2 className="text-[15px] font-bold tracking-tight text-white">Live Threat Feed</h2>
                            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-[0.2em] mt-0.5">
                                {events.length} active event{events.length !== 1 ? 's' : ''} • Real-time analysis
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            <span className="size-1 bg-slate-600 rounded-full"></span>
                            Last Updated
                        </div>
                        <span className="text-[13px] font-mono text-primary/70 tabular-nums">12:04:32.410</span>
                    </div>
                </div>

                {/* Table Content */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white/[0.015]">
                                <th className="px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Time</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Role</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Alert Type</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Host ID</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Anomaly Score</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Event Type</th>
                                <th className="px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                            {events.map((event, idx) => {
                                const styles = getVerdictStyles(event.verdict);
                                const score = Math.round((event.score || 0) * 10);
                                return (
                                    <tr key={event._id || idx} className="hover:bg-white/[0.03] transition-all duration-200 group relative">
                                        {/* Left edge accent */}
                                        {/* Time */}
                                        <td className="px-8 py-5">
                                            <div className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full ${styles.dot} opacity-0 group-hover:opacity-100 transition-opacity`}></div>
                                            <div className="text-[13px] font-semibold text-white">{new Date(event.timestamp * 1000).toLocaleDateString()}</div>
                                            <div className="text-[10px] font-mono text-slate-600 mt-0.5">{new Date(event.timestamp * 1000).toLocaleTimeString()}</div>
                                        </td>
                                        {/* Role */}
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className={`size-2.5 rounded-full ${styles.dot} shrink-0`}></div>
                                                <span className="text-[13px] font-bold text-slate-200">{event.verdict || '—'}</span>
                                            </div>
                                        </td>
                                        {/* Alert Type */}
                                        <td className="px-6 py-5">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${styles.badge}`}>
                                                <span className="size-1 rounded-full bg-current"></span>
                                                {event.verdict ? event.verdict.split(' ').pop() : '—'}
                                            </span>
                                        </td>
                                        {/* Host ID */}
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-[14px] text-slate-600">router</span>
                                                <span className="text-[12px] font-semibold text-slate-400">{event.host_id || 'Unknown'}</span>
                                            </div>
                                        </td>
                                        {/* Anomaly Score */}
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3 w-44">
                                                <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${styles.bar} transition-all duration-500`}
                                                        style={{ width: `${Math.min(100, score)}%` }}
                                                    ></div>
                                                </div>
                                                <span className={`text-[12px] font-bold w-10 text-right tabular-nums ${styles.text}`}>
                                                    {score}%
                                                </span>
                                            </div>
                                        </td>
                                        {/* Event Type */}
                                        <td className="px-6 py-5">
                                            <span className="text-[12px] font-semibold text-slate-400">
                                                {event.attack_type || (event.verdict?.includes('DDoS') ? 'DDoS Attack' : 'Heuristic Detection')}
                                            </span>
                                        </td>
                                        {/* Actions */}
                                        <td className="px-8 py-5 text-right">
                                            <button onClick={() => setSelectedEvent(event)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.03] hover:bg-primary/20 text-slate-500 hover:text-primary text-[12px] font-bold transition-all duration-200 border border-transparent hover:border-primary/20 group/btn">
                                                Details
                                                <span className="material-symbols-outlined text-[14px] group-hover/btn:translate-x-0.5 transition-transform">arrow_forward</span>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {events.length === 0 && !loading && (
                                <tr>
                                    <td colSpan="6" className="px-8 py-24 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="size-14 rounded-2xl bg-white/[0.03] flex items-center justify-center border border-white/5">
                                                <span className="material-symbols-outlined text-3xl text-slate-600">shield</span>
                                            </div>
                                            <p className="text-sm text-slate-500 font-medium">No threat intelligence data received yet</p>
                                            <p className="text-[11px] text-slate-600">Events will appear here as they are detected</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="px-8 py-4 border-t border-white/[0.04] bg-white/[0.01] flex items-center justify-between">
                    <div className="text-[11px] font-medium text-slate-500 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[14px] text-slate-600">analytics</span>
                        Analyzing <span className="text-slate-300 font-bold mx-1">{events.length}</span> events in current view
                    </div>
                    <div className="flex items-center gap-1">
                        <button className="p-1.5 rounded-lg hover:bg-white/5 text-slate-600 hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                        </button>
                        <button className="p-1.5 rounded-lg hover:bg-white/5 text-slate-600 hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── Detail Panel Overlay ─── */}
            {selectedEvent && (() => {
                const s = getVerdictStyles(selectedEvent.verdict);
                const sc = Math.round((selectedEvent.score || 0) * 10);
                return (
                    <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedEvent(null)}>
                        {/* Backdrop */}
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
                        {/* Panel */}
                        <div
                            className="relative w-full max-w-lg bg-[#0d1117] border-l border-white/10 shadow-2xl overflow-y-auto animate-slide-in-right"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Panel Header */}
                            <div className="sticky top-0 z-10 px-8 py-6 border-b border-white/5 bg-[#0d1117]/95 backdrop-blur-md flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`size-3 rounded-full ${s.dot}`}></div>
                                    <h3 className="text-lg font-bold text-white">Event Details</h3>
                                </div>
                                <button onClick={() => setSelectedEvent(null)} className="p-2 rounded-xl hover:bg-white/5 text-slate-500 hover:text-white transition-colors">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            {/* Panel Body */}
                            <div className="p-8 space-y-5">
                                {/* ── AI Verdict ── */}
                                <div className="premium-glass rounded-2xl p-5 border border-white/5">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">AI Verdict</div>
                                        <span className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border text-[11px] font-bold uppercase tracking-wider ${s.badge}`}>
                                            <span className="size-1.5 rounded-full bg-current"></span>
                                            {selectedEvent.verdict || 'Unknown'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1 h-2.5 bg-white/[0.04] rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${s.bar} transition-all duration-700`} style={{ width: `${Math.min(100, sc)}%` }}></div>
                                        </div>
                                        <span className={`text-xl font-black tabular-nums ${s.text}`}>{sc}%</span>
                                    </div>
                                </div>

                                {/* ── Host Intelligence ── */}
                                {(() => {
                                    const host = selectedEvent.full_log?.host || {};
                                    const hostFields = [
                                        { label: 'Host ID', value: host.id || selectedEvent.host_id, icon: 'dns' },
                                        { label: 'OS', value: host.os, icon: 'computer' },
                                        { label: 'IP Address', value: host.ip, icon: 'lan' },
                                        { label: 'MAC Address', value: host.mac, icon: 'settings_ethernet' },
                                    ].filter(f => f.value);
                                    if (hostFields.length === 0) return null;
                                    return (
                                        <div className="premium-glass rounded-2xl p-5 border border-white/5">
                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Host Intelligence</div>
                                            <div className="grid grid-cols-2 gap-3">
                                                {hostFields.map(f => (
                                                    <div key={f.label} className="bg-black/20 rounded-xl p-3">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="material-symbols-outlined text-[14px] text-slate-600">{f.icon}</span>
                                                            <span className="text-[10px] font-bold text-slate-600 uppercase">{f.label}</span>
                                                        </div>
                                                        <div className="text-[13px] font-mono font-semibold text-white truncate">{f.value}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* ── Core Info ── */}
                                <div className="premium-glass rounded-2xl p-5 border border-white/5">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Event Summary</div>
                                    {[
                                        { label: 'Time', value: new Date(selectedEvent.timestamp * 1000).toLocaleString(), icon: 'schedule' },
                                        { label: 'Role', value: selectedEvent.group_id || selectedEvent.full_log?.role, icon: 'shield' },
                                        { label: 'Event Type', value: selectedEvent.event_type || selectedEvent.full_log?.event?.type, icon: 'category' },
                                        { label: 'Status', value: selectedEvent.status || 'active', icon: 'radio_button_checked' },
                                        { label: 'MISP', value: selectedEvent.misp_hit ? '⚠ Confirmed' : 'No Hit', icon: 'policy' },
                                    ].filter(f => f.value).map(f => (
                                        <div key={f.label} className="flex items-center justify-between py-3 border-b border-white/[0.04] last:border-0">
                                            <div className="flex items-center gap-2.5">
                                                <span className="material-symbols-outlined text-[16px] text-slate-600">{f.icon}</span>
                                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{f.label}</span>
                                            </div>
                                            <span className="text-[13px] font-semibold text-white">{f.value}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* ── Event Details (Type-Specific) ── */}
                                {(() => {
                                    const evt = selectedEvent.full_log?.event || {};
                                    const type = evt.type;
                                    if (!type) return null;

                                    // Build key-value pairs from the event object, excluding 'type' and 'timestamp'
                                    const detailEntries = Object.entries(evt)
                                        .filter(([k]) => !['type', 'timestamp'].includes(k))
                                        .map(([k, v]) => ({
                                            label: k.replace(/_/g, ' '),
                                            value: typeof v === 'object' ? JSON.stringify(v) : String(v)
                                        }));

                                    if (detailEntries.length === 0) return null;

                                    // Icon map per event type
                                    const typeIcons = {
                                        process_start: 'play_circle', process_kill: 'stop_circle',
                                        file_create: 'note_add', file_modified: 'edit_document', file_delete: 'delete',
                                        service_create: 'add_circle', service_delete: 'remove_circle', service_modified: 'build',
                                        registry: 'app_registration', network_connection: 'cable', dns_query: 'dns',
                                        session: 'person', console_login: 'login', auth_login: 'key',
                                        scheduled_task: 'timer', account_management: 'manage_accounts',
                                        group_management: 'group', module_load: 'extension', pipe_event: 'data_object',
                                        wmi_event: 'terminal', traffic: 'swap_horiz'
                                    };

                                    return (
                                        <div className="premium-glass rounded-2xl p-5 border border-white/5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="material-symbols-outlined text-[16px] text-primary">{typeIcons[type] || 'info'}</span>
                                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{type.replace(/_/g, ' ')} Details</div>
                                            </div>
                                            <div className="space-y-0">
                                                {detailEntries.map(({ label, value }) => (
                                                    <div key={label} className="flex items-start justify-between py-2.5 border-b border-white/[0.03] last:border-0 gap-4">
                                                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider shrink-0">{label}</span>
                                                        <span className="text-[12px] font-mono text-slate-300 text-right break-all">{value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* ── System Resources (if present) ── */}
                                {(() => {
                                    const status = selectedEvent.full_log?.status;
                                    if (!status) return null;
                                    return (
                                        <div className="premium-glass rounded-2xl p-5 border border-white/5">
                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">System Resources</div>
                                            <div className="grid grid-cols-2 gap-3">
                                                {Object.entries(status).map(([key, val]) => (
                                                    <div key={key} className="bg-black/20 rounded-xl p-3">
                                                        <div className="text-[10px] text-slate-600 uppercase mb-1">{key.toUpperCase()}</div>
                                                        <div className="text-sm font-bold text-white">{val}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* ── DDoS Evidence ── */}
                                {selectedEvent.attack_type && (
                                    <div className="premium-glass rounded-2xl p-5 border border-white/5">
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">DDoS Evidence</div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-black/20 rounded-xl p-3">
                                                <div className="text-[10px] text-slate-600 uppercase mb-1">Attack Type</div>
                                                <div className="text-sm font-bold text-danger">{selectedEvent.attack_type}</div>
                                            </div>
                                            <div className="bg-black/20 rounded-xl p-3">
                                                <div className="text-[10px] text-slate-600 uppercase mb-1">Packets/sec</div>
                                                <div className="text-sm font-bold text-white tabular-nums">{(selectedEvent.pps || 0).toLocaleString()}</div>
                                            </div>
                                            {selectedEvent.target_ip && (
                                                <div className="col-span-2 bg-black/20 rounded-xl p-3">
                                                    <div className="text-[10px] text-slate-600 uppercase mb-1">Target IP</div>
                                                    <div className="text-sm font-mono font-bold text-white">{selectedEvent.target_ip}</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* ── Raw Log ── */}
                                <div className="premium-glass rounded-2xl border border-white/5 overflow-hidden">
                                    <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Raw Event Data</div>
                                        <span className="text-[10px] text-slate-600 font-mono">{selectedEvent.uuid?.slice(0, 8) || '—'}</span>
                                    </div>
                                    <pre className="text-[11px] font-mono text-slate-400 p-5 overflow-x-auto max-h-72 overflow-y-auto bg-black/20">
                                        {JSON.stringify(selectedEvent.full_log || selectedEvent, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </main>
    );
}
