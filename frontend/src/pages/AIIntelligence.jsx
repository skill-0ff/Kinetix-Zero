import React, { useState, useEffect } from 'react';

export default function AIIntelligence() {
    const [aiRunning, setAiRunning] = useState(false);
    const [uptimeSeconds, setUptimeSeconds] = useState(0);

    // Engine Activity Log state — seeded with examples until real events arrive
    const [activityLog, setActivityLog] = useState([
        { time: '---', msg: '[System] Waiting for engine events...', type: 'info' },
    ]);

    // Live metrics state
    const [stats, setStats] = useState({
        anomalyScore: 7.4,         // Mock
        modelAccuracy: 99.84,      // Mock
        falsePositiveRate: 0.12,   // Mock
        inferenceSpeed: 12,        // Mock
        logsPerSec: 0,             // Live
        totalProcessed: '14.2M',   // Mock
        memoryVectors: '892K',     // Mock
        activeThreats: 23,         // Mock
        gpuUsage: 0,               // Live
        cpuUsage: 0,               // Live
        ramUsage: 0                // Live
    });

    // Fetch engine status & setup SSE
    useEffect(() => {
        let isMounted = true;
        let eventSource = null;

        const fetchStatus = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('http://localhost:8000/api/v1/system/engine/ai/control', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({ action: 'status' })
                });
                const data = await res.json();
                if (data.status === 'success' && isMounted) {
                    setAiRunning(data.running);
                    if (data.running === false) {
                        // Reset metrics if engine is clearly not running
                        setUptimeSeconds(0);
                        setStats(prev => ({
                            ...prev,
                            cpuUsage: 0,
                            ramUsage: 0,
                            gpuUsage: 0,
                            logsPerSec: 0
                        }));
                    }
                }
            } catch (error) {
                console.error('Failed to fetch AI engine status:', error);
            }
        };

        const setupSSE = () => {
            const token = localStorage.getItem('token');
            if (!token) return;

            eventSource = new EventSource(`http://localhost:8000/api/v1/stream?token=${token}`);

            eventSource.onmessage = (event) => {
                if (event.data === ': heartbeat') return;
                try {
                    const update = JSON.parse(event.data);
                    if (update.type === 'metrics' && update.doc && isMounted) {
                        const m = update.doc;
                        setStats(prev => ({
                            ...prev,
                            cpuUsage: Math.round(m.cpu || 0),
                            ramUsage: Math.round(m.ram || 0),
                            gpuUsage: Math.round(m.gpu || 0),
                            logsPerSec: Math.round(m.eps_in || 0)
                        }));
                        if (m.uptime !== undefined) {
                            setUptimeSeconds(m.uptime);
                        }
                    } else if ((update.type === 'events' || update.type === 'ddos') && update.doc && isMounted) {
                        const d = update.doc;
                        const ts = d.timestamp ? new Date(d.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '??:??:??';
                        const verdict = d.verdict || d.ai_verdict || 'EVENT';
                        const score = d.score != null ? ` score=${d.score.toFixed(4)}` : '';
                        const host = d.host_id ? ` host=${d.host_id}` : '';
                        let tag, type;
                        if (update.type === 'ddos') {
                            tag = '[DDoS]'; type = 'danger';
                        } else if (verdict.includes('ANOMALY') || verdict.includes('THREAT')) {
                            tag = '[AI]'; type = 'warn';
                        } else if (verdict.includes('FALSE POSITIVE')) {
                            tag = '[AI]'; type = 'info';
                        } else {
                            tag = '[AI]'; type = 'success';
                        }
                        const msg = `${tag} ${verdict}${score}${host}`;
                        setActivityLog(prev => [{ time: ts, msg, type }, ...prev].slice(0, 50));
                    }
                } catch (err) {
                    console.error('SSE Parse Error:', err);
                }
            };

            eventSource.onerror = (err) => {
                console.error('SSE Connection Error:', err);
                eventSource?.close();
            };
        };

        fetchStatus();
        setupSSE();

        const interval = setInterval(fetchStatus, 5000);
        return () => {
            isMounted = false;
            clearInterval(interval);
            if (eventSource) eventSource.close();
        };
    }, []);

    // Simulated uptime tick
    useEffect(() => {
        if (!aiRunning) return;
        const timer = setInterval(() => setUptimeSeconds(s => s + 1), 1000);
        return () => clearInterval(timer);
    }, [aiRunning]);

    const toggleEngine = async () => {
        const action = aiRunning ? 'stop' : 'start';
        setAiRunning(!aiRunning); // Optimistic UI update

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:8000/api/v1/system/engine/ai/control', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ action })
            });
            const data = await res.json();
            if (data.status === 'success') {
                setAiRunning(data.running);
                if (!data.running) {
                    setUptimeSeconds(0);
                    setStats(prev => ({
                        ...prev,
                        cpuUsage: 0,
                        ramUsage: 0,
                        gpuUsage: 0,
                        logsPerSec: 0
                    }));
                }
            } else {
                setAiRunning(aiRunning); // revert on soft error
            }
        } catch (error) {
            console.error(`Failed to ${action} engine:`, error);
            setAiRunning(aiRunning); // revert on hard error
        }
    };

    const formatUptime = (s) => {
        const d = Math.floor(s / 86400);
        const h = Math.floor((s % 86400) / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return `${d > 0 ? d + 'd ' : ''}${h}h ${m}m ${sec}s`;
    };

    return (
        <main className="flex-1 mt-24 px-8 pb-12 max-w-[1440px] mx-auto w-full space-y-6">

            {/* ─── Header Row ─── */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className={`size-12 rounded-2xl flex items-center justify-center ${aiRunning ? 'bg-gradient-to-br from-accent-purple to-pink-600 shadow-[0_0_30px_rgba(168,85,247,0.5)]' : 'bg-slate-800'} transition-all duration-500`}>
                        <span className="material-symbols-outlined text-white text-2xl">{aiRunning ? 'auto_awesome' : 'auto_awesome'}</span>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Neural Core AI</h2>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className={`size-2 rounded-full ${aiRunning ? 'bg-success animate-pulse' : 'bg-slate-600'}`}></span>
                            <span className={`text-[11px] font-bold uppercase tracking-wider ${aiRunning ? 'text-success' : 'text-slate-500'}`}>
                                {aiRunning ? 'Online' : 'Offline'}
                            </span>
                            <span className="text-slate-700 text-[11px]">•</span>
                            <span className="text-[11px] font-mono text-slate-500">{formatUptime(uptimeSeconds)}</span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={toggleEngine}
                    className={`px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2.5 transition-all duration-300 ${aiRunning
                        ? 'bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                        : 'bg-success/10 border border-success/20 text-success hover:bg-success/20 hover:shadow-[0_0_20px_rgba(34,197,94,0.2)]'
                        }`}
                >
                    <span className="material-symbols-outlined text-[18px]">{aiRunning ? 'stop_circle' : 'play_circle'}</span>
                    {aiRunning ? 'Stop Engine' : 'Start Engine'}
                </button>
            </div>

            {/* ─── Core Visualizer + Primary Stats ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Neural Core Visualizer */}
                <div className="lg:col-span-2 premium-glass rounded-3xl p-8 border border-accent-purple/20 relative overflow-hidden flex flex-col items-center justify-center min-h-[380px]">
                    <div className="absolute inset-0 bg-gradient-to-br from-accent-purple/5 via-transparent to-pink-500/5"></div>

                    {/* Animated Rings */}
                    <div className="relative size-56 flex items-center justify-center mb-6">
                        <div className={`absolute inset-0 border-2 rounded-full transition-all duration-500 ${aiRunning ? 'border-accent-purple/25 animate-[spin_10s_linear_infinite]' : 'border-slate-800'}`}></div>
                        <div className={`absolute inset-4 border-2 border-dashed rounded-full transition-all duration-500 ${aiRunning ? 'border-primary/30 animate-[spin_15s_linear_infinite_reverse]' : 'border-slate-800'}`}></div>
                        <div className={`absolute inset-8 border rounded-full transition-all duration-500 ${aiRunning ? 'border-pink-500/20 animate-pulse' : 'border-slate-800'}`}></div>
                        <div className={`absolute inset-12 border border-dashed rounded-full transition-all duration-500 ${aiRunning ? 'border-accent-purple/15 animate-[spin_20s_linear_infinite]' : 'border-slate-800'}`}></div>

                        {/* Center Orb */}
                        <div className={`size-20 rounded-full flex items-center justify-center z-10 transition-all duration-700 ${aiRunning
                            ? 'bg-gradient-to-br from-accent-purple to-pink-600 shadow-[0_0_60px_rgba(168,85,247,0.6)] animate-pulse'
                            : 'bg-slate-800 shadow-none'
                            }`}>
                            <span className="material-symbols-outlined text-white text-3xl">{aiRunning ? 'psychology' : 'psychology'}</span>
                        </div>
                    </div>

                    {/* Anomaly Score */}
                    <div className="relative z-10 w-full max-w-sm">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Global Anomaly Score</span>
                            <span className={`text-2xl font-black tabular-nums ${stats.anomalyScore > 7 ? 'text-danger' : stats.anomalyScore > 4 ? 'text-warning' : 'text-success'}`}>
                                {stats.anomalyScore.toFixed(1)}
                            </span>
                        </div>
                        <div className="h-3 w-full bg-white/[0.04] rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-1000"
                                style={{
                                    width: `${stats.anomalyScore * 10}%`,
                                    background: stats.anomalyScore > 7
                                        ? 'linear-gradient(90deg, #ef4444, #f87171)'
                                        : stats.anomalyScore > 4
                                            ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                                            : 'linear-gradient(90deg, #22c55e, #4ade80)',
                                    boxShadow: `0 0 15px ${stats.anomalyScore > 7 ? 'rgba(239,68,68,0.4)' : stats.anomalyScore > 4 ? 'rgba(245,158,11,0.4)' : 'rgba(34,197,94,0.4)'}`
                                }}
                            ></div>
                        </div>
                        <div className="flex justify-between mt-2">
                            <span className="text-[9px] text-slate-600 font-mono">0 SAFE</span>
                            <span className="text-[9px] text-slate-600 font-mono">10 CRITICAL</span>
                        </div>
                    </div>
                </div>

                {/* Right Stats Column */}
                <div className="flex flex-col gap-4">
                    {/* Model Accuracy */}
                    <div className="premium-glass rounded-2xl p-5 border border-white/5 flex-1">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-[16px] text-success">verified</span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Model Accuracy</span>
                        </div>
                        <div className="text-3xl font-black text-white tabular-nums">
                            {stats.modelAccuracy}%
                        </div>
                        <span className="text-[10px] text-success font-bold flex items-center gap-0.5 mt-1">
                            <span className="material-symbols-outlined text-[12px]">arrow_upward</span> 0.02%
                        </span>
                    </div>

                    {/* False Positive Rate */}
                    <div className="premium-glass rounded-2xl p-5 border border-white/5 flex-1">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-[16px] text-primary">shield</span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">False Positive Rate</span>
                        </div>
                        <div className="text-3xl font-black text-white tabular-nums">
                            {stats.falsePositiveRate}%
                        </div>
                        <span className="text-[10px] text-success font-bold flex items-center gap-0.5 mt-1">
                            <span className="material-symbols-outlined text-[12px]">arrow_downward</span> 0.05%
                        </span>
                    </div>

                    {/* Inference Speed */}
                    <div className="premium-glass rounded-2xl p-5 border border-white/5 flex-1">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-[16px] text-warning">speed</span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Inference Speed</span>
                        </div>
                        <div className="text-3xl font-black text-white tabular-nums flex items-baseline gap-1">
                            {stats.inferenceSpeed}<span className="text-sm text-slate-500">ms</span>
                        </div>
                        <span className="text-[10px] text-slate-500 mt-1">avg per event</span>
                    </div>
                </div>
            </div>

            {/* ─── Live Metrics Row ─── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Logs/sec', value: stats.logsPerSec.toLocaleString(), icon: 'speed', color: 'primary' },
                    { label: 'Total Processed', value: stats.totalProcessed, icon: 'database', color: 'accent-purple' },
                    { label: 'Memory Vectors', value: stats.memoryVectors, icon: 'memory', color: 'pink-500' },
                    { label: 'Active Threats', value: stats.activeThreats, icon: 'warning', color: 'danger' },
                ].map(({ label, value, icon, color }) => (
                    <div key={label} className="premium-glass rounded-2xl p-5 border border-white/5">
                        <div className="flex items-center gap-2 mb-3">
                            <span className={`material-symbols-outlined text-[16px] text-${color}`}>{icon}</span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
                        </div>
                        <div className="text-2xl font-black text-white tabular-nums">{value}</div>
                    </div>
                ))}
            </div>

            {/* ─── System Resources & Activity Log (Side by Side) ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* GPU / CPU / RAM */}
                <div className="premium-glass rounded-2xl p-6 border border-white/5 flex flex-col">
                    <div className="flex items-center gap-2 mb-6">
                        <span className="material-symbols-outlined text-[18px] text-accent-purple">monitoring</span>
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">System Resources</span>
                    </div>
                    <div className="space-y-6 flex-1 flex flex-col justify-center">
                        {[
                            { label: 'GPU', value: stats.gpuUsage, icon: 'memory', gradient: 'from-accent-purple to-pink-500' },
                            { label: 'CPU', value: stats.cpuUsage, icon: 'developer_board', gradient: 'from-primary to-blue-400' },
                            { label: 'RAM', value: stats.ramUsage, icon: 'storage', gradient: 'from-success to-emerald-400' },
                        ].map(({ label, value, icon, gradient }) => (
                            <div key={label}>
                                <div className="flex items-center justify-between mb-2.5">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[15px] text-slate-600">{icon}</span>
                                        <span className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                                    </div>
                                    <span className="text-[14px] font-bold text-white tabular-nums">{value}%</span>
                                </div>
                                <div className="h-2.5 bg-white/[0.04] rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-700`}
                                        style={{ width: `${value}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Activity Log */}
                <div className="premium-glass rounded-2xl border border-white/5 flex flex-col overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/[0.04] flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px] text-slate-500">terminal</span>
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Engine Activity Log</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="relative flex size-2">
                                <span className={`${aiRunning ? 'animate-ping' : ''} absolute inline-flex h-full w-full rounded-full ${aiRunning ? 'bg-success' : 'bg-slate-600'} opacity-75`}></span>
                                <span className={`relative inline-flex rounded-full size-2 ${aiRunning ? 'bg-success' : 'bg-slate-600'}`}></span>
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${aiRunning ? 'text-success' : 'text-slate-500'}`}>
                                {aiRunning ? 'Live' : 'Offline'}
                            </span>
                        </div>
                    </div>
                    <div className="p-5 font-mono text-[11px] space-y-3 flex-1 overflow-y-auto bg-black/20 min-h-[240px]">
                        {activityLog.map((log, i) => (
                            <div key={i} className="flex items-start gap-3">
                                <span className="text-slate-600 shrink-0">{log.time}</span>
                                <span className={`${log.type === 'danger' ? 'text-danger' : log.type === 'warn' ? 'text-warning' : log.type === 'success' ? 'text-success' : 'text-slate-400'}`}>
                                    {log.msg}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

        </main>
    );
}
