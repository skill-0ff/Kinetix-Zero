import React, { useState, useEffect } from 'react';

export default function AIIntelligence() {
    const [aiRunning, setAiRunning] = useState(false);
    const [uptimeSeconds, setUptimeSeconds] = useState(0);
    const [systemMetrics, setSystemMetrics] = useState({ cpu: 0, ram: 0, gpu: 0 });
    const [isLoading, setIsLoading] = useState(false);

    // Poll live metrics from Control Manager
    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const res = await fetch('http://localhost:5002/api/control/metrics');
                if (res.ok) {
                    const data = await res.json();
                    setAiRunning(data.status === 'Online');
                    setUptimeSeconds(data.uptime_seconds);
                    setSystemMetrics({
                        cpu: data.cpu_percent,
                        ram: data.ram_percent,
                        gpu: data.gpu_percent
                    });
                }
            } catch (err) {
                // Control API might be down or not started yet
                setAiRunning(false);
                setSystemMetrics({ cpu: 0, ram: 0, gpu: 0 });
            }
        };

        fetchMetrics();
        const timer = setInterval(fetchMetrics, 1000);
        return () => clearInterval(timer);
    }, []);

    const toggleEngine = async () => {
        setIsLoading(true);
        try {
            const endpoint = aiRunning ? 'stop' : 'start';
            await fetch(`http://localhost:5002/api/control/${endpoint}`, { method: 'POST' });
            // Let the next poll pick up the status change
        } catch (err) {
            console.error('Failed to toggle engine:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const formatUptime = (s) => {
        const d = Math.floor(s / 86400);
        const h = Math.floor((s % 86400) / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return `${d > 0 ? d + 'd ' : ''}${h}h ${m}m ${sec}s`;
    };

    // AI Mock Data (Metrics not tracked by Control Manager yet)
    const stats = {
        anomalyScore: 7.4,
        modelAccuracy: 99.84,
        falsePositiveRate: 0.12,
        inferenceSpeed: 12,
        logsPerSec: aiRunning ? 1247 : 0,
        totalProcessed: '14.2M',
        memoryVectors: '892K',
        activeThreats: aiRunning ? 23 : 0,
        gpuUsage: systemMetrics.gpu,
        cpuUsage: systemMetrics.cpu,
        ramUsage: systemMetrics.ram,
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
                    disabled={isLoading}
                    className={`px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2.5 transition-all duration-300 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''} ${aiRunning
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
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                                <span className="relative inline-flex rounded-full size-2 bg-success"></span>
                            </span>
                            <span className="text-[10px] font-bold text-success uppercase tracking-wider">Live</span>
                        </div>
                    </div>
                    <div className="p-5 font-mono text-[11px] space-y-3 flex-1 overflow-y-auto bg-black/20 min-h-[240px]">
                        {[
                            { time: '22:04:41', msg: '[AI] Batch processed: 128 events → 2 anomalies detected', type: 'warn' },
                            { time: '22:04:38', msg: '[AI] Memory upsert: 128 vectors saved to Qdrant', type: 'info' },
                            { time: '22:04:35', msg: '[AI] Inference batch: avg_score=0.0312, max=0.742', type: 'info' },
                            { time: '22:04:30', msg: '[MISP] Correlation check: 1 known threat matched (IoC: SHA256)', type: 'danger' },
                            { time: '22:04:28', msg: '[AI] Window queue: 4 batches, 512 total events buffered', type: 'info' },
                            { time: '22:04:22', msg: '[DDoS] Sentinel clear: no param variations in last 60s', type: 'success' },
                            { time: '22:04:15', msg: '[AI] Model checkpoint saved: epoch 48, loss=0.0021', type: 'success' },
                            { time: '22:04:10', msg: '[AI] Batch processed: 128 events → 0 anomalies detected', type: 'info' },
                        ].map((log, i) => (
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
