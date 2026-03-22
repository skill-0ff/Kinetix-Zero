import React, { useRef } from 'react';
import { useKinetixData } from '../hooks/useKinetixData';

export default function Overview() {
    const { data: metrics } = useKinetixData('metrics', { limit: 1440 });
    const { data: recentEvents } = useKinetixData('events', { limit: 5 });
    const { data: activeAlerts } = useKinetixData('events', { limit: 0, filter: { status: 'active' } });

    const currentMetrics = metrics[0] || {};

    // Core engine writes metrics every ~5-10s. If the newest metric is older than 20s, or we have no data, there's no signal.
    const isServerConnected = metrics.length > 0 && (Date.now() / 1000 - currentMetrics.timestamp) < 20;

    // Keep last known good system metrics to prevent 0% blink between updates
    const lastSystemRef = useRef({ cpu: 0, gpu: 0, ram: 0 });

    // Database polling state
    const [dbStats, setDbStats] = React.useState(null);
    const [dbOffline, setDbOffline] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        const fetchDbStats = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('http://localhost:8000/api/v1/system/db-stats', {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                });
                if (!res.ok) {
                    if (!cancelled) { setDbStats(null); setDbOffline(false); }
                    return;
                }
                const data = await res.json();
                if (!cancelled) {
                    if (data.status === 'offline') {
                        setDbOffline(true);
                        setDbStats(null);
                    } else {
                        setDbOffline(false);
                        setDbStats(data);
                    }
                }
            } catch (err) {
                // API is down (no response)
                if (!cancelled) { setDbStats(null); setDbOffline(false); }
            }
        };

        fetchDbStats();
        const id = setInterval(fetchDbStats, 20000); // refresh every 20s
        return () => { cancelled = true; clearInterval(id); };
    }, []);

    return (
        <main className="flex-1 pt-24 pb-12 px-6 lg:px-12 max-w-[1440px] mx-auto w-full">
            {/* Dashboard Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">
                {/* Online Agents (Col span 3) */}
                <div className="lg:col-span-3 glass-card rounded-2xl p-6 relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 size-24 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all"></div>
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-400 text-sm font-medium">Online Agents</span>
                        <span className="material-symbols-outlined text-primary">sensors</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-bold tracking-tight">{currentMetrics.verdict_safe || 0}</span>

                        <span className="text-emerald-400 text-xs font-semibold flex items-center">
                            <span className="material-symbols-outlined text-xs">arrow_upward</span> 12%
                        </span>
                    </div>
                    <div className="mt-4 flex gap-1">
                        <div className="h-1.5 w-full bg-primary/20 rounded-full overflow-hidden">
                            <div className="h-full w-[85%] bg-primary neo-glow transition-all duration-1000"></div>
                        </div>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500 uppercase tracking-widest font-bold">Status: Synchronized</p>
                </div>

                {/* Vulnerability Count (Col span 3) */}
                <div className="lg:col-span-3 glass-card rounded-2xl p-6 relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 size-24 bg-red-500/10 rounded-full blur-3xl group-hover:bg-red-500/20 transition-all"></div>
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-400 text-sm font-medium">Vulnerabilities</span>
                        <span className="material-symbols-outlined text-red-500">security</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-bold tracking-tight text-white">{currentMetrics.verdict_threat || 0}</span>

                        <span className="text-red-400 text-xs font-semibold flex items-center">
                            <span className="material-symbols-outlined text-xs">warning</span> High Risk
                        </span>
                    </div>
                    <div className="mt-6 flex items-center gap-3">
                        <div className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-[10px] text-red-400 font-bold uppercase">12 Critical</div>
                        <div className="px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-[10px] text-orange-400 font-bold uppercase">30 Warning</div>
                    </div>
                </div>

                {/* Database Usage (Col span 3) */}
                <div className="lg:col-span-3 glass-card rounded-2xl p-6 group">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-400 text-sm font-medium">Database Storage</span>
                        <span className="material-symbols-outlined text-accent-purple">database</span>
                    </div>
                    {(() => {
                        if (!dbStats && !dbOffline) {
                            // NO SIGNAL (API down)
                            return (
                                <div className="flex-1 w-full flex flex-col items-center justify-center gap-2 mt-10">
                                    <div className="relative">
                                        <span className="material-symbols-outlined text-3xl text-slate-600 animate-pulse">signal_cellular_off</span>
                                        <div className="absolute -top-1 -right-1 size-2.5 bg-red-500/80 rounded-full animate-ping"></div>
                                        <div className="absolute -top-1 -right-1 size-2.5 bg-red-500 rounded-full"></div>
                                    </div>
                                    <p className="text-xs font-semibold text-slate-400 tracking-wide">NO SIGNAL</p>
                                    <p className="text-[9px] text-slate-600 text-center max-w-[200px]">API server unreachable.</p>
                                </div>
                            );
                        }

                        if (dbOffline) {
                            // DB OFFLINE
                            return (
                                <div className="flex-1 w-full flex flex-col items-center justify-center gap-2 mt-10">
                                    <div className="relative">
                                        <span className="material-symbols-outlined text-3xl text-red-500/80">database_off</span>
                                    </div>
                                    <p className="text-xs font-semibold text-red-400 tracking-wide uppercase">DB IS OFFLINE</p>
                                    <p className="text-[9px] text-slate-500 text-center max-w-[200px]">MongoDB connection failed.</p>
                                </div>
                            );
                        }

                        // We have stats
                        // Assuming 2GB max cap for MongoDB local test, and 4TB max cap for Qdrant (hardcoded for now as Qdrant isn't in dbstats yet)
                        const formatBytes = (bytes) => {
                            if (bytes === 0) return '0 B';
                            const k = 1024;
                            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
                            const i = Math.floor(Math.log(bytes) / Math.log(k));
                            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                        };

                        const mbSize = dbStats.total_size_bytes || 0;
                        const qdrantSize = dbStats.qdrant_size_bytes || 0;

                        // Use a reasonable local max for the visualization, e.g., 2GB = 2 * 1024^3
                        const mongoMax = 2 * 1024 * 1024 * 1024;
                        const mongoPct = Math.min(100, (mbSize / mongoMax) * 100);

                        // Qdrant Max (e.g. 4GB for local)
                        const qdrantMax = 4 * 1024 * 1024 * 1024;
                        const qdrantPct = Math.min(100, (qdrantSize / qdrantMax) * 100);

                        return (
                            <div className="flex-1 flex flex-col justify-end space-y-6 mt-10 mb-2">
                                <div>
                                    <div className="flex justify-between text-xs mb-2">
                                        <span className="text-slate-300">Qdrant Vector DB</span>
                                        <span className="text-slate-400 font-semibold">{formatBytes(qdrantSize)} / 4 GB</span>
                                    </div>
                                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-accent-purple rounded-full transition-all duration-1000" style={{ width: `${Math.max(5, qdrantPct)}%` }}></div>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs mb-2">
                                        <span className="text-slate-300">MongoDB Clusters</span>
                                        <span className="text-slate-400 font-semibold">{formatBytes(mbSize)} / 2 GB</span>
                                    </div>
                                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${Math.max(5, mongoPct)}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>

                {/* Resource Monitor (Col span 3) */}
                <div className="lg:col-span-3 glass-card rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-400 text-sm font-medium">Resource Monitor</span>
                        <span className="material-symbols-outlined text-slate-400">developer_board</span>
                    </div>
                    {(() => {
                        const hasSignal = isServerConnected;
                        if (!hasSignal) {
                            return (
                                <div className="flex-1 w-full flex flex-col items-center justify-center gap-3 py-2">
                                    <div className="relative">
                                        <span className="material-symbols-outlined text-4xl text-slate-600 animate-pulse">signal_cellular_off</span>
                                        <div className="absolute -top-1 -right-1 size-3 bg-red-500/80 rounded-full animate-ping"></div>
                                        <div className="absolute -top-1 -right-1 size-3 bg-red-500 rounded-full"></div>
                                    </div>
                                    <p className="text-sm font-semibold text-slate-400 tracking-wide">NO SIGNAL</p>
                                    <p className="text-[10px] text-slate-600 text-center max-w-[200px]">Waiting for metrics from the core engine.</p>
                                </div>
                            );
                        }
                        // Use last known good values to prevent 0% blink
                        if (currentMetrics.system_cpu_percent != null) {
                            lastSystemRef.current = {
                                cpu: Math.round(currentMetrics.system_cpu_percent),
                                gpu: Math.round(currentMetrics.system_gpu_percent || 0),
                                ram: Math.round(currentMetrics.system_ram_percent || 0),
                            };
                        }
                        const { cpu, gpu, ram } = lastSystemRef.current;
                        const offset = (pct) => 100 - pct;
                        const circleStyle = { transition: 'stroke-dashoffset 1s ease-in-out' };
                        return (
                            <div className="grid grid-cols-3 gap-4">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="relative size-14 flex items-center justify-center">
                                        <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                                            <circle className="stroke-white/10 fill-none" cx="18" cy="18" r="16" strokeWidth="3"></circle>
                                            <circle className="stroke-primary fill-none" cx="18" cy="18" r="16" strokeDasharray="100" strokeDashoffset={offset(cpu)} strokeLinecap="round" strokeWidth="3" style={circleStyle}></circle>
                                        </svg>
                                        <span className="absolute text-[11px] font-bold">{cpu}%</span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-bold uppercase">CPU</span>
                                </div>
                                <div className="flex flex-col items-center gap-2">
                                    <div className="relative size-14 flex items-center justify-center">
                                        <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                                            <circle className="stroke-white/10 fill-none" cx="18" cy="18" r="16" strokeWidth="3"></circle>
                                            <circle className="stroke-accent-purple fill-none" cx="18" cy="18" r="16" strokeDasharray="100" strokeDashoffset={offset(gpu)} strokeLinecap="round" strokeWidth="3" style={circleStyle}></circle>
                                        </svg>
                                        <span className="absolute text-[11px] font-bold">{gpu}%</span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-bold uppercase">GPU</span>
                                </div>
                                <div className="flex flex-col items-center gap-2">
                                    <div className="relative size-14 flex items-center justify-center">
                                        <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                                            <circle className="stroke-white/10 fill-none" cx="18" cy="18" r="16" strokeWidth="3"></circle>
                                            <circle className="stroke-blue-400 fill-none" cx="18" cy="18" r="16" strokeDasharray="100" strokeDashoffset={offset(ram)} strokeLinecap="round" strokeWidth="3" style={circleStyle}></circle>
                                        </svg>
                                        <span className="absolute text-[11px] font-bold">{ram}%</span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-bold uppercase">RAM</span>
                                </div>
                            </div>
                        );
                    })()}
                </div>

                {/* Data Received Graph (Col span 4) */}
                <div className="lg:col-span-4 glass-card rounded-2xl p-6 min-h-[300px] flex flex-col">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-300">Transmission</h3>
                            <p className="text-xs text-slate-500 text-[10px]">Events per Second</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <span className="text-xl font-bold tracking-tight text-white">{currentMetrics.eps || 0}</span>
                                <p className="text-[10px] text-slate-500">current</p>
                            </div>
                            <div className="flex gap-1">
                                <span className="px-2 py-1 text-[9px] bg-primary/20 text-primary border border-primary/20 rounded-lg">24H</span>
                            </div>
                        </div>
                    </div>
                    {(() => {
                        const sliced = metrics.slice(0, 40).reverse();
                        const epsData = sliced.map(m => m.eps || 0);
                        const hasSignal = isServerConnected;

                        if (!hasSignal) {
                            return (
                                <div className="flex-1 w-full flex flex-col items-center justify-center gap-3">
                                    <div className="relative">
                                        <span className="material-symbols-outlined text-4xl text-slate-600 animate-pulse">signal_cellular_off</span>
                                        <div className="absolute -top-1 -right-1 size-3 bg-red-500/80 rounded-full animate-ping"></div>
                                        <div className="absolute -top-1 -right-1 size-3 bg-red-500 rounded-full"></div>
                                    </div>
                                    <p className="text-sm font-semibold text-slate-400 tracking-wide">NO SIGNAL</p>
                                    <p className="text-[10px] text-slate-600 text-center max-w-[200px]">Waiting for data stream from server. Ensure the collector is running.</p>
                                </div>
                            );
                        }

                        const maxEps = Math.max(...epsData, 100);
                        const points = epsData.map((eps, i) => {
                            const x = (i / (epsData.length - 1)) * 400;
                            const y = 100 - (eps / maxEps) * 90;
                            return `${x},${y}`;
                        });

                        const linePath = `M ${points.join(' L ')}`;
                        const areaPath = `${linePath} L 400,100 L 0,100 Z`;

                        const oldestTs = sliced[0]?.timestamp;
                        const newestTs = sliced[sliced.length - 1]?.timestamp;
                        const formatTs = (ts) => ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--';

                        return (
                            <>
                                <div className="flex-1 w-full relative">
                                    <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 100">
                                        <defs>
                                            <linearGradient id="epsGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#256af4" stopOpacity="0.4" />
                                                <stop offset="100%" stopColor="#256af4" stopOpacity="0" />
                                            </linearGradient>
                                        </defs>
                                        <path d={areaPath} fill="url(#epsGradient)" />
                                        <path d={linePath} fill="none" stroke="#256af4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_0_8px_rgba(37,106,244,0.5)]" />
                                    </svg>
                                </div>
                                <div className="flex justify-end mt-4 text-[9px] text-slate-500 font-medium">
                                    <span>{formatTs(newestTs)}</span>
                                </div>
                            </>
                        );
                    })()}
                </div>

                {/* Alert Panel (Col span 4) */}
                <div className="lg:col-span-4 glass-card rounded-2xl p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <span className="text-sm font-semibold text-slate-300">Intrusion Alerts</span>
                        <span className="material-symbols-outlined text-red-500 animate-pulse">crisis_alert</span>
                    </div>
                    {(() => {
                        const hasSignal = isServerConnected;
                        if (!hasSignal) {
                            return (
                                <div className="flex-1 w-full flex flex-col items-center justify-center gap-3">
                                    <div className="relative">
                                        <span className="material-symbols-outlined text-4xl text-slate-600 animate-pulse">signal_cellular_off</span>
                                        <div className="absolute -top-1 -right-1 size-3 bg-red-500/80 rounded-full animate-ping"></div>
                                        <div className="absolute -top-1 -right-1 size-3 bg-red-500 rounded-full"></div>
                                    </div>
                                    <p className="text-sm font-semibold text-slate-400 tracking-wide">NO SIGNAL</p>
                                    <p className="text-[10px] text-slate-600 text-center max-w-[200px]">Waiting for event data from the core engine.</p>
                                </div>
                            );
                        }
                        const newCount = activeAlerts.filter(e => e.verdict?.includes('ANOMALY')).length;
                        const knownCount = activeAlerts.filter(e => e.verdict?.includes('THREAT')).length;
                        const fpCount = activeAlerts.filter(e => e.verdict?.includes('FALSE POSITIVE')).length;
                        return (
                            <>
                                <div className="grid grid-cols-3 gap-3 mb-6">
                                    <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl text-center">
                                        <div className="text-xl font-bold text-red-400">{newCount}</div>
                                        <div className="text-[10px] text-red-500/80 font-bold uppercase">New</div>
                                    </div>
                                    <div className="bg-primary/10 border border-primary/20 p-3 rounded-xl text-center">
                                        <div className="text-xl font-bold text-primary">{knownCount}</div>
                                        <div className="text-[10px] text-primary/80 font-bold uppercase">Known</div>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 p-3 rounded-xl text-center">
                                        <div className="text-xl font-bold text-slate-400">{fpCount}</div>
                                        <div className="text-[10px] text-slate-500 font-bold uppercase">FP</div>
                                    </div>
                                </div>
                                <div className="flex-1 space-y-3 overflow-y-auto max-h-[140px] pr-2 custom-scrollbar">
                                    {recentEvents.map((event, idx) => (
                                        <div key={event._id || idx} className="flex items-center gap-3 p-2 rounded-lg bg-white/5 border border-white/10">
                                            <div className={`size-2 rounded-full ${event.verdict.includes('ANOMALY') || event.verdict.includes('THREAT') ? 'bg-red-500' : 'bg-emerald-500'}`}></div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] font-semibold truncate">{event.verdict}</p>
                                                <p className="text-[9px] text-slate-500">{event.host_id || 'Unknown Node'} • {new Date(event.timestamp * 1000).toLocaleTimeString()}</p>
                                            </div>
                                            <button className="material-symbols-outlined text-slate-500 text-sm">open_in_new</button>
                                        </div>
                                    ))}
                                </div>
                            </>
                        );
                    })()}
                </div>

                {/* Verdict Distribution (Col span 4) */}
                <div className="lg:col-span-4 glass-card rounded-2xl p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <span className="text-sm font-semibold text-slate-300">Verdict Distribution</span>
                        <span className="material-symbols-outlined text-primary">pie_chart</span>
                    </div>
                    {(() => {
                        const hasSignal = isServerConnected;
                        if (!hasSignal) {
                            return (
                                <div className="flex-1 w-full flex flex-col items-center justify-center gap-3">
                                    <div className="relative">
                                        <span className="material-symbols-outlined text-4xl text-slate-600 animate-pulse">signal_cellular_off</span>
                                        <div className="absolute -top-1 -right-1 size-3 bg-red-500/80 rounded-full animate-ping"></div>
                                        <div className="absolute -top-1 -right-1 size-3 bg-red-500 rounded-full"></div>
                                    </div>
                                    <p className="text-sm font-semibold text-slate-400 tracking-wide">NO SIGNAL</p>
                                    <p className="text-[10px] text-slate-600 text-center max-w-[200px]">Waiting for verdict data from the core engine.</p>
                                </div>
                            );
                        }
                        const anomalyCount = activeAlerts.filter(e => e.verdict?.includes('ANOMALY')).length;
                        const threatCount = activeAlerts.filter(e => e.verdict?.includes('THREAT')).length;
                        const fpCount = activeAlerts.filter(e => e.verdict?.includes('FALSE POSITIVE')).length;
                        const total = anomalyCount + threatCount + fpCount;
                        const pct = (v) => total > 0 ? Math.round((v / total) * 100) : 0;

                        const anomalyPct = pct(anomalyCount);
                        const threatPct = pct(threatCount);
                        const fpPct = pct(fpCount);

                        // Donut chart segment offsets (each segment follows the previous)
                        const seg1 = anomalyPct;
                        const seg2 = threatPct;
                        const seg3 = fpPct;

                        return (
                            <div className="flex items-center gap-6 flex-1">
                                <div className="relative size-32 flex-shrink-0">
                                    <svg className="size-full -rotate-90 drop-shadow-[0_0_8px_rgba(37,106,244,0.3)]" viewBox="0 0 36 36">
                                        {total > 0 ? (
                                            <>
                                                <circle className="stroke-orange-500 fill-none" cx="18" cy="18" r="15.9" strokeDasharray={`${seg1} ${100 - seg1}`} strokeDashoffset="0" strokeWidth="3"></circle>
                                                <circle className="stroke-red-500 fill-none" cx="18" cy="18" r="15.9" strokeDasharray={`${seg2} ${100 - seg2}`} strokeDashoffset={`${-seg1}`} strokeWidth="3"></circle>
                                                <circle className="stroke-accent-purple fill-none" cx="18" cy="18" r="15.9" strokeDasharray={`${seg3} ${100 - seg3}`} strokeDashoffset={`${-(seg1 + seg2)}`} strokeWidth="3"></circle>
                                            </>
                                        ) : (
                                            <circle className="stroke-white/10 fill-none" cx="18" cy="18" r="15.9" strokeWidth="3"></circle>
                                        )}
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center flex-col">
                                        <span className="text-xs font-bold text-white">TOTAL</span>
                                        <span className="text-[10px] text-slate-400">{total > 999 ? `${(total / 1000).toFixed(1)}k` : total}</span>
                                    </div>
                                </div>
                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center justify-between glass-panel px-2 py-1 rounded-lg border-white/5">
                                        <div className="flex items-center gap-2">
                                            <div className="size-2 rounded-full bg-orange-500 animate-pulse"></div>
                                            <span className="text-[10px] text-slate-300 font-medium">Anomaly</span>
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-bold">{anomalyPct}%</span>
                                    </div>
                                    <div className="flex items-center justify-between glass-panel px-2 py-1 rounded-lg border-white/5">
                                        <div className="flex items-center gap-2">
                                            <div className="size-2 rounded-full bg-red-500"></div>
                                            <span className="text-[10px] text-slate-300 font-medium">Threat</span>
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-bold">{threatPct}%</span>
                                    </div>
                                    <div className="flex items-center justify-between glass-panel px-2 py-1 rounded-lg border-white/5">
                                        <div className="flex items-center gap-2">
                                            <div className="size-2 rounded-full bg-accent-purple"></div>
                                            <span className="text-[10px] text-slate-300 font-medium">FP</span>
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-bold">{fpPct}%</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>

                <div className="lg:col-span-12 glass-card rounded-2xl p-6 flex flex-col md:flex-row items-center gap-8 border-l-4 border-l-accent-purple">
                    <div className="flex items-center gap-4 min-w-[200px]">
                        <div className="size-12 bg-accent-purple/20 rounded-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-accent-purple text-2xl animate-spin-slow">smart_toy</span>
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-white">Neural Engine V3</h4>
                            <p className="text-xs text-slate-500">Model Training Active</p>
                        </div>
                    </div>
                    <div className="flex-1 w-full">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Progress: Epoch 48/100</span>
                            <span className="text-lg font-bold text-accent-purple">74.2%</span>
                        </div>
                        <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden p-[2px]">
                            <div className="h-full w-[74.2%] bg-gradient-to-r from-primary via-accent-purple to-pink-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                        </div>
                    </div>
                    <div className="flex gap-6">
                        <div className="text-center">
                            <p className="text-xs text-slate-500">Accuracy</p>
                            <p className="text-sm font-bold text-white">99.8%</p>
                        </div>
                        <div className="text-center">
                            <p className="text-xs text-slate-500">Loss</p>
                            <p className="text-sm font-bold text-white">0.004</p>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
