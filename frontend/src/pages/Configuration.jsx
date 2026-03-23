import React, { useState, useEffect } from 'react';
import { useKinetixData } from '../hooks/useKinetixData';
import './Configuration.css';

export default function Configuration() {
    const [showAdvanced, setShowAdvanced] = useState(false);
    const { data: configData, loading: configLoading, refresh: refreshConfig } = useKinetixData('config');
    const config = configData?.[0] || null;
    const [updating, setUpdating] = useState(false);

    const [localCheckpointInterval, setLocalCheckpointInterval] = useState(3600);
    const [localMaxCheckpoints, setLocalMaxCheckpoints] = useState(10);
    const [localForensicRate, setLocalForensicRate] = useState(100);
    const [localContextEpochs, setLocalContextEpochs] = useState(5);
    const [localAnomalyThreshold, setLocalAnomalyThreshold] = useState(0.9);
    const [localPort, setLocalPort] = useState(5001);
    const [localTimeWindow, setLocalTimeWindow] = useState(5.0);
    const [localMaxSequence, setLocalMaxSequence] = useState(100);
    const [localDDoSThreshold, setLocalDDoSThreshold] = useState(50);
    const [localMaxQueueSize, setLocalMaxQueueSize] = useState(10000);
    const [localRetentionEnabled, setLocalRetentionEnabled] = useState(true);
    const [localRetentionInterval, setLocalRetentionInterval] = useState(24);
    const [localRetentionDays, setLocalRetentionDays] = useState({
        ai_safe: 30,
        new_anomaly: 90,
        known_threat: 365,
        false_positive: 7,
        misp_alert: 365,
        ddos_evidence: 3
    });
    const [localMemDedup, setLocalMemDedup] = useState(0.05);
    const [localMemQuery, setLocalMemQuery] = useState(0.1);
    const [localQdrantPath, setLocalQdrantPath] = useState("DB/vector");
    const [localQdrantUrl, setLocalQdrantUrl] = useState("");
    const [localMongoUri, setLocalMongoUri] = useState("mongodb://localhost:27017/");
    const [localMispEnabled, setLocalMispEnabled] = useState(false);
    const [localMispUrl, setLocalMispUrl] = useState("https://misp.local");
    const [localMispVerify, setLocalMispVerify] = useState(true);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        if (updating || isDragging || !config) return;

        if (config.checkpoint_interval_seconds) {
            setLocalCheckpointInterval(config.checkpoint_interval_seconds);
        }
        if (config.max_checkpoints_history !== undefined) {
            setLocalMaxCheckpoints(config.max_checkpoints_history);
        }
        if (config.forensic_sample_rate !== undefined) {
            setLocalForensicRate(config.forensic_sample_rate);
        }
        if (config.ai_context_epochs !== undefined) {
            setLocalContextEpochs(config.ai_context_epochs);
        }
        if (config.ai_anomaly_threshold !== undefined) {
            setLocalAnomalyThreshold(config.ai_anomaly_threshold);
        }
        if (config.port !== undefined) {
            setLocalPort(config.port);
        }
        if (config.time_window !== undefined) {
            setLocalTimeWindow(config.time_window);
        }
        if (config.max_sequence !== undefined) {
            setLocalMaxSequence(config.max_sequence);
        }
        if (config.ddos_threshold !== undefined) {
            setLocalDDoSThreshold(config.ddos_threshold);
        }
        if (config.max_queue_size !== undefined) {
            setLocalMaxQueueSize(config.max_queue_size);
        }
        if (config.retention_policy) {
            setLocalRetentionEnabled(config.retention_policy.enabled);
            setLocalRetentionInterval(config.retention_policy.run_interval_hours);
            if (config.retention_policy.keep_days) {
                setLocalRetentionDays(config.retention_policy.keep_days);
            }
        }
        if (config.memory_dedup_dist !== undefined) {
            setLocalMemDedup(config.memory_dedup_dist);
        }
        if (config.memory_query_dist !== undefined) {
            setLocalMemQuery(config.memory_query_dist);
        }
        if (config.qdrant_path !== undefined) {
            setLocalQdrantPath(config.qdrant_path);
        }
        if (config.qdrant_url !== undefined) {
            setLocalQdrantUrl(config.qdrant_url || "");
        }
        if (config.mongo_uri !== undefined) {
            setLocalMongoUri(config.mongo_uri);
        }
        if (config.misp_enabled !== undefined) {
            setLocalMispEnabled(config.misp_enabled);
        }
        if (config.misp_url !== undefined) {
            setLocalMispUrl(config.misp_url);
        }
        if (config.misp_verify_ssl !== undefined) {
            setLocalMispVerify(config.misp_verify_ssl);
        }
    }, [config, updating, isDragging]);

    const updateAlertPolicy = async (key, value) => {
        if (!config) return;
        setUpdating(true);
        try {
            const token = localStorage.getItem('token');
            const payload = {
                alert_policy: {
                    console_alerts: {
                        [key]: value
                    }
                }
            };
            const res = await fetch('http://localhost:8000/api/v1/data/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                refreshConfig();
            }
        } catch (err) {
            console.error("Failed to update config", err);
        } finally {
            setUpdating(false);
        }
    };

    const updateLogStorage = async (key, value) => {
        if (!config) return;
        setUpdating(true);
        try {
            const token = localStorage.getItem('token');
            const payload = {
                storage_policy: {
                    save_logs: {
                        [key]: value
                    },
                    save_vectors: {
                        [key]: value
                    }
                }
            };
            const res = await fetch('http://localhost:8000/api/v1/data/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                refreshConfig();
            }
        } catch (err) {
            console.error("Failed to update config", err);
        } finally {
            setUpdating(false);
        }
    };

    const updateCheckpoint = async (value) => {
        if (!config) return;
        setUpdating(true);
        try {
            const token = localStorage.getItem('token');
            const payload = {
                checkpoint_interval_seconds: parseInt(value)
            };
            const res = await fetch('http://localhost:8000/api/v1/data/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                refreshConfig();
            }
        } catch (err) {
            console.error("Failed to update checkpoint interval", err);
        } finally {
            setUpdating(false);
        }
    };

    const updateCheckpointHistory = async (value) => {
        if (!config) return;
        setUpdating(true);
        try {
            const token = localStorage.getItem('token');
            const payload = {
                max_checkpoints_history: parseInt(value)
            };
            const res = await fetch('http://localhost:8000/api/v1/data/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                refreshConfig();
            }
        } catch (err) {
            console.error("Failed to update checkpoint history", err);
        } finally {
            setUpdating(false);
        }
    };

    const updateForensics = async (payload) => {
        if (!config) return;
        setUpdating(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:8000/api/v1/data/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                refreshConfig();
            }
        } catch (err) {
            console.error("Failed to update forensics", err);
        } finally {
            setUpdating(false);
        }
    };

    const updateAIEngine = async (payload) => {
        if (!config) return;
        setUpdating(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:8000/api/v1/data/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                refreshConfig();
            }
        } catch (err) {
            console.error("Failed to update AI Engine", err);
        } finally {
            setUpdating(false);
        }
    };

    const updateNetwork = async (value) => {
        if (!config) return;
        setUpdating(true);
        try {
            const token = localStorage.getItem('token');
            const payload = {
                port: parseInt(value)
            };
            const res = await fetch('http://localhost:8000/api/v1/data/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                refreshConfig();
            }
        } catch (err) {
            console.error("Failed to update Network", err);
        } finally {
            setUpdating(false);
        }
    };

    const updateBrainLogic = async (payload) => {
        if (!config) return;
        setUpdating(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:8000/api/v1/data/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                refreshConfig();
            }
        } catch (err) {
            console.error("Failed to update Brain Logic", err);
        } finally {
            setUpdating(false);
        }
    };

    const updatePersistence = async (payload) => {
        if (!config) return;
        setUpdating(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:8000/api/v1/data/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    retention_policy: payload
                })
            });
            if (res.ok) {
                refreshConfig();
            }
        } catch (err) {
            console.error("Failed to update Persistence", err);
        } finally {
            setUpdating(false);
        }
    };

    const updateMemory = async (payload) => {
        if (!config) return;
        setUpdating(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:8000/api/v1/data/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                refreshConfig();
            }
        } catch (err) {
            console.error("Failed to update Memory", err);
        } finally {
            setUpdating(false);
        }
    };

    const updateMisp = async (payload) => {
        if (!config) return;
        setUpdating(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:8000/api/v1/data/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                refreshConfig();
            }
        } catch (err) {
            console.error("Failed to update MISP", err);
        } finally {
            setUpdating(false);
        }
    };

    const updateDatabase = async (payload) => {
        if (!config) return;
        setUpdating(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:8000/api/v1/data/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                refreshConfig();
            }
        } catch (err) {
            console.error("Failed to update Database", err);
        } finally {
            setUpdating(false);
        }
    };

    return (
        <main className="flex-1 pt-28 pb-8 px-8 max-w-[1440px] mx-auto w-full">
            <div className="flex items-end justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">System Configuration</h2>
                    <p className="text-slate-400 text-sm">Fine-tune the security engine and network protocols.</p>
                </div>
                <div className="flex gap-4">
                    <button
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl border transition-all text-sm font-medium group ${showAdvanced ? 'bg-primary/20 text-primary border-primary/30' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}
                        onClick={() => setShowAdvanced(!showAdvanced)}
                    >
                        <span className={`material-symbols-outlined text-[18px] transition-transform ${showAdvanced ? 'rotate-90' : 'group-hover:rotate-45'}`}>settings</span>
                        Advanced Settings
                    </button>
                    <button className="px-6 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 transition-all text-sm font-medium">
                        Reset Defaults
                    </button>
                    <button className="px-6 py-2.5 rounded-xl bg-primary text-white shadow-[0_0_20px_rgba(37,106,244,0.5)] hover:brightness-110 transition-all text-sm font-semibold">
                        Apply Changes
                    </button>
                </div>
            </div>

            {/* Upper Config Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                {/* 1. Alert Management */}
                <div className="glass-card rounded-[2rem] p-6 neon-border-blue relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 size-32 bg-primary/20 blur-3xl rounded-full"></div>
                    <div className="flex items-center gap-4 mb-6">
                        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/30 shadow-[0_0_15px_rgba(37,106,244,0.2)]">
                            <span className="material-symbols-outlined text-[22px]">notification_important</span>
                        </div>
                        <h3 className="text-lg font-bold text-white tracking-tight">Alert Management</h3>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">New Alerts</span>
                            <button
                                onClick={() => updateAlertPolicy('new_anomaly', !(config?.alert_policy?.console_alerts?.new_anomaly))}
                                disabled={updating || !config}
                                className={`w-10 h-5 rounded-full relative transition-all ${config?.alert_policy?.console_alerts?.new_anomaly ? 'bg-primary shadow-[0_0_10px_rgba(37,106,244,0.5)]' : 'bg-white/10'}`}>
                                <span className={`absolute top-1 size-3 rounded-full transition-all ${config?.alert_policy?.console_alerts?.new_anomaly ? 'right-1 bg-white' : 'left-1 bg-slate-400'}`}></span>
                            </button>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Known Threats</span>
                            <button
                                onClick={() => updateAlertPolicy('known_threat', !(config?.alert_policy?.console_alerts?.known_threat))}
                                disabled={updating || !config}
                                className={`w-10 h-5 rounded-full relative transition-all ${config?.alert_policy?.console_alerts?.known_threat ? 'bg-primary shadow-[0_0_10px_rgba(37,106,244,0.5)]' : 'bg-white/10'}`}>
                                <span className={`absolute top-1 size-3 rounded-full transition-all ${config?.alert_policy?.console_alerts?.known_threat ? 'right-1 bg-white' : 'left-1 bg-slate-400'}`}></span>
                            </button>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">False Positives</span>
                            <button
                                onClick={() => updateAlertPolicy('false_positive', !(config?.alert_policy?.console_alerts?.false_positive))}
                                disabled={updating || !config}
                                className={`w-10 h-5 rounded-full relative transition-all ${config?.alert_policy?.console_alerts?.false_positive ? 'bg-primary shadow-[0_0_10px_rgba(37,106,244,0.5)]' : 'bg-white/10'}`}>
                                <span className={`absolute top-1 size-3 rounded-full transition-all ${config?.alert_policy?.console_alerts?.false_positive ? 'right-1 bg-white' : 'left-1 bg-slate-400'}`}></span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* 2. Role Management */}
                <div className="glass-card rounded-[2rem] p-6 lg:row-span-2 neon-border-purple relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 size-32 bg-purple-400/20 blur-3xl rounded-full"></div>
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-purple-400/10 flex items-center justify-center text-purple-400 border border-purple-400/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                                <span className="material-symbols-outlined text-[22px]">shield_person</span>
                            </div>
                            <h3 className="text-lg font-bold text-white tracking-tight">Role Management</h3>
                        </div>
                        <button className="size-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors border border-white/10 shadow-[0_0_10px_rgba(255,255,255,0.05)]">
                            <span className="material-symbols-outlined text-xl text-white">add</span>
                        </button>
                    </div>
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">search</span>
                        <input className="w-full input-glass !pl-10 !py-2" placeholder="Search roles..." type="text" />
                    </div>
                    <div className="flex-1 space-y-2 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                        <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between group hover:bg-white/10 transition-all">
                            <div className="flex items-center gap-3">
                                <div className="size-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                                <span className="text-sm font-medium text-slate-200">System Admin</span>
                            </div>
                            <span className="material-symbols-outlined text-slate-600 group-hover:text-slate-300 cursor-pointer">more_vert</span>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between group hover:bg-white/10 transition-all">
                            <div className="flex items-center gap-3">
                                <div className="size-2 rounded-full bg-primary shadow-[0_0_8px_rgba(37,106,244,0.6)]"></div>
                                <span className="text-sm font-medium text-slate-200">Security Analyst</span>
                            </div>
                            <span className="material-symbols-outlined text-slate-600 group-hover:text-slate-300 cursor-pointer">more_vert</span>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between group hover:bg-white/10 transition-all">
                            <div className="flex items-center gap-3">
                                <div className="size-2 rounded-full bg-accent-purple shadow-[0_0_8px_rgba(168,85,247,0.6)]"></div>
                                <span className="text-sm font-medium text-slate-200">Network Lead</span>
                            </div>
                            <span className="material-symbols-outlined text-slate-600 group-hover:text-slate-300 cursor-pointer">more_vert</span>
                        </div>
                    </div>
                </div>

                {/* 3. Log Storage Control */}
                <div className="glass-card rounded-[2rem] p-6 neon-border-blue relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 size-32 bg-primary/20 blur-3xl rounded-full"></div>
                    <div className="flex items-center gap-4 mb-6">
                        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/30 shadow-[0_0_15px_rgba(37,106,244,0.2)]">
                            <span className="material-symbols-outlined text-[22px]">database</span>
                        </div>
                        <h3 className="text-lg font-bold text-white tracking-tight">Log Storage</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Safe</span>
                            <button
                                onClick={() => updateLogStorage('ai_safe', !(config?.storage_policy?.save_logs?.ai_safe))}
                                disabled={updating || !config}
                                className={`w-8 h-4 rounded-full relative transition-all ${config?.storage_policy?.save_logs?.ai_safe ? 'bg-primary shadow-[0_0_8px_rgba(37,106,244,0.4)]' : 'bg-white/10'}`}>
                                <span className={`absolute top-0.5 size-3 rounded-full transition-all ${config?.storage_policy?.save_logs?.ai_safe ? 'right-0.5 bg-white' : 'left-0.5 bg-slate-400'}`}></span>
                            </button>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Threat</span>
                            <button
                                onClick={() => updateLogStorage('anomaly', !(config?.storage_policy?.save_logs?.anomaly))}
                                disabled={updating || !config}
                                className={`w-8 h-4 rounded-full relative transition-all ${config?.storage_policy?.save_logs?.anomaly ? 'bg-primary shadow-[0_0_8px_rgba(37,106,244,0.4)]' : 'bg-white/10'}`}>
                                <span className={`absolute top-0.5 size-3 rounded-full transition-all ${config?.storage_policy?.save_logs?.anomaly ? 'right-0.5 bg-white' : 'left-0.5 bg-slate-400'}`}></span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* 4. Checkpointing */}
                <div className="glass-card rounded-[2rem] p-6 neon-border-amber relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 size-32 bg-amber-400/20 blur-3xl rounded-full"></div>
                    <div className="flex items-center gap-4 mb-6">
                        <div className="size-10 rounded-xl bg-amber-400/10 flex items-center justify-center text-amber-400 border border-amber-400/30 shadow-[0_0_15px_rgba(251,191,36,0.2)]">
                            <span className="material-symbols-outlined text-[22px]">save</span>
                        </div>
                        <h3 className="text-lg font-bold text-white tracking-tight">Checkpointing</h3>
                    </div>
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-bold text-slate-300 uppercase tracking-wider">Auto-save frequency</label>
                                <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 shadow-[0_0_10px_rgba(37,106,244,0.2)]">
                                    {localCheckpointInterval}s
                                </span>
                            </div>
                            <input
                                className="w-full"
                                max="86400"
                                min="60"
                                type="range"
                                value={localCheckpointInterval}
                                onChange={(e) => setLocalCheckpointInterval(e.target.value)}
                                onMouseUp={(e) => updateCheckpoint(e.target.value)}
                                onTouchEnd={(e) => updateCheckpoint(e.target.value)}
                            />
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-bold text-slate-300 uppercase tracking-wider">History Rotation</label>
                                <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 shadow-[0_0_10px_rgba(37,106,244,0.2)]">
                                    {localMaxCheckpoints} files
                                </span>
                            </div>
                            <input
                                className="w-full"
                                max="50"
                                min="1"
                                type="range"
                                value={localMaxCheckpoints}
                                onChange={(e) => setLocalMaxCheckpoints(e.target.value)}
                                onMouseUp={(e) => updateCheckpointHistory(e.target.value)}
                                onTouchEnd={(e) => updateCheckpointHistory(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* 5. Forensics Control */}
                <div className="glass-card rounded-[2rem] p-6 neon-border-amber relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 size-32 bg-amber-400/20 blur-3xl rounded-full"></div>
                    <div className="flex items-center gap-4 mb-6">
                        <div className="size-10 rounded-xl bg-amber-400/10 flex items-center justify-center text-amber-400 border border-amber-400/30 shadow-[0_0_15px_rgba(251,191,36,0.2)]">
                            <span className="material-symbols-outlined text-[22px]">fingerprint</span>
                        </div>
                        <h3 className="text-lg font-bold text-white tracking-tight">Forensics Control</h3>
                    </div>
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-bold text-slate-300 uppercase tracking-wider">Sample Rate (%)</label>
                                <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 shadow-[0_0_10px_rgba(37,106,244,0.2)]">
                                    {localForensicRate}%
                                </span>
                            </div>
                            <input
                                className="w-full"
                                max="100"
                                min="0"
                                type="range"
                                value={localForensicRate}
                                onMouseDown={() => setIsDragging(true)}
                                onTouchStart={() => setIsDragging(true)}
                                onChange={(e) => setLocalForensicRate(parseInt(e.target.value) || 0)}
                                onMouseUp={() => {
                                    setIsDragging(false);
                                    updateForensics({ forensic_sample_rate: parseInt(localForensicRate) });
                                }}
                                onTouchEnd={() => {
                                    setIsDragging(false);
                                    updateForensics({ forensic_sample_rate: parseInt(localForensicRate) });
                                }}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-300 uppercase tracking-wider">Mode</span>
                            <div className="flex p-1 bg-white/5 rounded-xl border border-white/10">
                                <button
                                    onClick={() => updateForensics({ forensic_sample_mode: 'random' })}
                                    className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${config?.forensic_sample_mode === 'random' ? 'bg-primary text-white shadow-[0_0_10px_rgba(37,106,244,0.3)]' : 'text-slate-500 hover:text-slate-300'}`}>
                                    RANDOM
                                </button>
                                <button
                                    onClick={() => updateForensics({ forensic_sample_mode: 'sequence' })}
                                    className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${config?.forensic_sample_mode === 'sequence' ? 'bg-primary text-white shadow-[0_0_10px_rgba(37,106,244,0.3)]' : 'text-slate-500 hover:text-slate-300'}`}>
                                    SEQ
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 6. AI Engine */}
                <div className="glass-card rounded-[2rem] p-6 neon-border-emerald relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 size-32 bg-emerald-400/20 blur-3xl rounded-full"></div>
                    <div className="flex items-center gap-4 mb-6">
                        <div className="size-10 rounded-xl bg-emerald-400/10 flex items-center justify-center text-emerald-400 border border-emerald-400/30 shadow-[0_0_15px_rgba(52,211,153,0.2)]">
                            <span className="material-symbols-outlined text-[22px]">neurology</span>
                        </div>
                        <h3 className="text-lg font-bold text-white tracking-tight">AI Engine</h3>
                    </div>
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <label className="text-sm font-bold text-slate-300 uppercase tracking-wider block">Context Memory</label>
                            <div className="relative flex items-center stepper-container">
                                <input
                                    className="w-full input-glass !pr-8"
                                    type="number"
                                    value={localContextEpochs}
                                    onChange={(e) => setLocalContextEpochs(e.target.value)}
                                    onBlur={(e) => updateAIEngine({ ai_context_epochs: parseInt(e.target.value) })}
                                />
                                <div className="absolute right-2 flex flex-col opacity-60">
                                    <span className="material-symbols-outlined text-[12px] stepper-btn" onClick={() => {
                                        const val = parseInt(localContextEpochs) + 1;
                                        setLocalContextEpochs(val);
                                        updateAIEngine({ ai_context_epochs: val });
                                    }}>keyboard_arrow_up</span>
                                    <span className="material-symbols-outlined text-[12px] stepper-btn" onClick={() => {
                                        const val = Math.max(1, parseInt(localContextEpochs) - 1);
                                        setLocalContextEpochs(val);
                                        updateAIEngine({ ai_context_epochs: val });
                                    }}>keyboard_arrow_down</span>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-bold text-slate-300 uppercase tracking-wider">Sensitivity</label>
                                <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 shadow-[0_0_10px_rgba(37,106,244,0.2)]">
                                    {Math.round(localAnomalyThreshold * 100)}%
                                </span>
                            </div>
                            <input
                                className="w-full"
                                max="1"
                                min="0"
                                step="0.01"
                                type="range"
                                value={localAnomalyThreshold}
                                onChange={(e) => setLocalAnomalyThreshold(e.target.value)}
                                onMouseUp={(e) => updateAIEngine({ ai_anomaly_threshold: parseFloat(e.target.value) })}
                                onTouchEnd={(e) => updateAIEngine({ ai_anomaly_threshold: parseFloat(e.target.value) })}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Detailed Advanced Configuration Panels */}
            {showAdvanced && (
                <div className="space-y-6 transition-all duration-300">
                    <div className="flex items-center gap-6">
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>
                        <span className="text-sm font-bold uppercase tracking-[0.3em] text-primary drop-shadow-[0_0_12px_rgba(37,106,244,0.8)]">
                            Detailed Advanced Settings
                        </span>
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 items-start">
                        {/* Database */}
                        <div className="glass-card rounded-[2rem] p-6 neon-border-cyan relative overflow-hidden group">
                            <div className="absolute -right-4 -top-4 size-32 bg-cyan-400/20 blur-3xl rounded-full"></div>
                            <div className="flex items-center gap-4 mb-6">
                                <div className="size-10 rounded-xl bg-cyan-400/10 flex items-center justify-center text-cyan-400 border border-cyan-400/30 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                                    <span className="material-symbols-outlined text-[22px]">database</span>
                                </div>
                                <h3 className="text-lg font-bold text-white tracking-tight">Database</h3>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Qdrant Path</label>
                                    <input
                                        className="w-full input-glass text-xs font-mono"
                                        type="text"
                                        value={localQdrantPath}
                                        onChange={(e) => setLocalQdrantPath(e.target.value)}
                                        onBlur={(e) => updateDatabase({ qdrant_path: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Qdrant URL (optional)</label>
                                    <input
                                        className="w-full input-glass text-xs font-mono"
                                        placeholder="null"
                                        type="text"
                                        value={localQdrantUrl}
                                        onChange={(e) => setLocalQdrantUrl(e.target.value)}
                                        onBlur={(e) => updateDatabase({ qdrant_url: e.target.value || null })}
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Mongo URI</label>
                                    <input
                                        className="w-full input-glass text-xs font-mono"
                                        type="text"
                                        value={localMongoUri}
                                        onChange={(e) => setLocalMongoUri(e.target.value)}
                                        onBlur={(e) => updateDatabase({ mongo_uri: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Network */}
                        <div className="glass-card rounded-[2rem] p-6 neon-border-blue relative overflow-hidden group">
                            <div className="absolute -right-4 -top-4 size-32 bg-primary/20 blur-3xl rounded-full"></div>
                            <div className="flex items-center gap-4 mb-6">
                                <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/30 shadow-[0_0_15px_rgba(37,106,244,0.2)]">
                                    <span className="material-symbols-outlined text-[22px]">lan</span>
                                </div>
                                <h3 className="text-lg font-bold text-white tracking-tight">Network</h3>
                            </div>
                            <div className="space-y-5">
                                <div className="relative">
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Service Port</label>
                                    <div className="relative flex items-center stepper-container">
                                        <input
                                            className="w-full input-glass !pr-12 font-mono text-xs"
                                            id="port-input"
                                            placeholder="Enter port..."
                                            type="number"
                                            value={localPort}
                                            onChange={(e) => setLocalPort(e.target.value)}
                                            onBlur={(e) => updateNetwork(e.target.value)}
                                        />
                                        <div className="absolute right-2 flex flex-col gap-0.5 opacity-60">
                                            <span className="material-symbols-outlined text-[14px] stepper-btn font-bold" onClick={() => {
                                                const val = parseInt(localPort) + 1;
                                                setLocalPort(val);
                                                updateNetwork(val);
                                            }}>keyboard_arrow_up</span>
                                            <span className="material-symbols-outlined text-[14px] stepper-btn font-bold" onClick={() => {
                                                const val = Math.max(1, parseInt(localPort) - 1);
                                                setLocalPort(val);
                                                updateNetwork(val);
                                            }}>keyboard_arrow_down</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Brain Logic */}
                        <div className="glass-card rounded-[2rem] p-6 neon-border-indigo relative overflow-hidden group">
                            <div className="absolute -right-4 -top-4 size-32 bg-indigo-400/20 blur-3xl rounded-full"></div>
                            <div className="flex items-center gap-4 mb-6">
                                <div className="size-10 rounded-xl bg-indigo-400/10 flex items-center justify-center text-indigo-400 border border-indigo-400/30 shadow-[0_0_15px_rgba(129,140,248,0.2)]">
                                    <span className="material-symbols-outlined text-[22px]">psychology</span>
                                </div>
                                <h3 className="text-lg font-bold text-white tracking-tight">Brain Logic</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                                <div className="col-span-1">
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Time Win</label>
                                    <div className="relative flex items-center stepper-container">
                                        <input
                                            className="w-full input-glass !pr-8 font-mono text-xs"
                                            id="timewin-input"
                                            step="0.1"
                                            type="number"
                                            value={localTimeWindow}
                                            onChange={(e) => setLocalTimeWindow(e.target.value)}
                                            onBlur={(e) => updateBrainLogic({ time_window: parseFloat(e.target.value) })}
                                        />
                                        <div className="absolute right-2 flex flex-col opacity-60">
                                            <span className="material-symbols-outlined text-[12px] stepper-btn" onClick={() => {
                                                const val = parseFloat(localTimeWindow) + 0.1;
                                                setLocalTimeWindow(val.toFixed(1));
                                                updateBrainLogic({ time_window: val });
                                            }}>keyboard_arrow_up</span>
                                            <span className="material-symbols-outlined text-[12px] stepper-btn" onClick={() => {
                                                const val = Math.max(0.1, parseFloat(localTimeWindow) - 0.1);
                                                setLocalTimeWindow(val.toFixed(1));
                                                updateBrainLogic({ time_window: val });
                                            }}>keyboard_arrow_down</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Max Seq</label>
                                    <div className="relative flex items-center stepper-container">
                                        <input
                                            className="w-full input-glass !pr-8 font-mono text-xs"
                                            id="maxseq-input"
                                            type="number"
                                            value={localMaxSequence}
                                            onChange={(e) => setLocalMaxSequence(e.target.value)}
                                            onBlur={(e) => updateBrainLogic({ max_sequence: parseInt(e.target.value) })}
                                        />
                                        <div className="absolute right-2 flex flex-col opacity-60">
                                            <span className="material-symbols-outlined text-[12px] stepper-btn" onClick={() => {
                                                const val = parseInt(localMaxSequence) + 1;
                                                setLocalMaxSequence(val);
                                                updateBrainLogic({ max_sequence: val });
                                            }}>keyboard_arrow_up</span>
                                            <span className="material-symbols-outlined text-[12px] stepper-btn" onClick={() => {
                                                const val = Math.max(1, parseInt(localMaxSequence) - 1);
                                                setLocalMaxSequence(val);
                                                updateBrainLogic({ max_sequence: val });
                                            }}>keyboard_arrow_down</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">DDoS Thr</label>
                                    <div className="relative flex items-center stepper-container">
                                        <input
                                            className="w-full input-glass !pr-8 font-mono text-xs"
                                            id="ddos-input"
                                            type="number"
                                            value={localDDoSThreshold}
                                            onChange={(e) => setLocalDDoSThreshold(e.target.value)}
                                            onBlur={(e) => updateBrainLogic({ ddos_threshold: parseInt(e.target.value) })}
                                        />
                                        <div className="absolute right-2 flex flex-col opacity-60">
                                            <span className="material-symbols-outlined text-[12px] stepper-btn" onClick={() => {
                                                const val = parseInt(localDDoSThreshold) + 10;
                                                setLocalDDoSThreshold(val);
                                                updateBrainLogic({ ddos_threshold: val });
                                            }}>keyboard_arrow_up</span>
                                            <span className="material-symbols-outlined text-[12px] stepper-btn" onClick={() => {
                                                const val = Math.max(0, parseInt(localDDoSThreshold) - 10);
                                                setLocalDDoSThreshold(val);
                                                updateBrainLogic({ ddos_threshold: val });
                                            }}>keyboard_arrow_down</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Queue Size</label>
                                    <div className="relative flex items-center stepper-container">
                                        <input
                                            className="w-full input-glass !pr-8 font-mono text-xs"
                                            id="queue-input"
                                            type="number"
                                            value={localMaxQueueSize}
                                            onChange={(e) => setLocalMaxQueueSize(e.target.value)}
                                            onBlur={(e) => updateBrainLogic({ max_queue_size: parseInt(e.target.value) })}
                                        />
                                        <div className="absolute right-2 flex flex-col opacity-60">
                                            <span className="material-symbols-outlined text-[12px] stepper-btn" onClick={() => {
                                                const val = parseInt(localMaxQueueSize) + 1000;
                                                setLocalMaxQueueSize(val);
                                                updateBrainLogic({ max_queue_size: val });
                                            }}>keyboard_arrow_up</span>
                                            <span className="material-symbols-outlined text-[12px] stepper-btn" onClick={() => {
                                                const val = Math.max(100, parseInt(localMaxQueueSize) - 1000);
                                                setLocalMaxQueueSize(val);
                                                updateBrainLogic({ max_queue_size: val });
                                            }}>keyboard_arrow_down</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>



                        {/* Memory */}
                        <div className="glass-card rounded-[2rem] p-6 neon-border-purple relative overflow-hidden group">
                            <div className="absolute -right-4 -top-4 size-32 bg-purple-400/20 blur-3xl rounded-full"></div>
                            <div className="flex items-center gap-4 mb-6">
                                <div className="size-10 rounded-xl bg-purple-400/10 flex items-center justify-center text-purple-400 border border-purple-400/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                                    <span className="material-symbols-outlined text-[22px]">data_array</span>
                                </div>
                                <h3 className="text-lg font-bold text-white tracking-tight">Memory</h3>
                            </div>
                            <div className="space-y-5">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Dedup Distance</label>
                                    <div className="relative flex items-center stepper-container">
                                        <input
                                            className="w-full input-glass !pr-10 font-mono text-xs"
                                            id="mem-dedup-input"
                                            step="0.01"
                                            type="number"
                                            value={localMemDedup}
                                            onChange={(e) => setLocalMemDedup(e.target.value)}
                                            onBlur={(e) => updateMemory({ memory_dedup_dist: parseFloat(e.target.value) })}
                                        />
                                        <div className="absolute right-2 flex items-center gap-1 opacity-60">
                                            <span className="material-symbols-outlined text-[16px] stepper-btn" onClick={() => {
                                                const val = parseFloat(localMemDedup) - 0.01;
                                                setLocalMemDedup(val.toFixed(2));
                                                updateMemory({ memory_dedup_dist: val });
                                            }}>keyboard_arrow_left</span>
                                            <span className="material-symbols-outlined text-[16px] stepper-btn" onClick={() => {
                                                const val = parseFloat(localMemDedup) + 0.01;
                                                setLocalMemDedup(val.toFixed(2));
                                                updateMemory({ memory_dedup_dist: val });
                                            }}>keyboard_arrow_right</span>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Query Distance</label>
                                    <input
                                        className="w-full input-glass font-mono text-xs"
                                        step="0.01"
                                        type="number"
                                        value={localMemQuery}
                                        onChange={(e) => setLocalMemQuery(e.target.value)}
                                        onBlur={(e) => updateMemory({ memory_query_dist: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Persistence */}
                        <div className="glass-card rounded-[2rem] p-6 neon-border-orange relative overflow-hidden group">
                            <div className="absolute -right-4 -top-4 size-32 bg-orange-400/20 blur-3xl rounded-full"></div>
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="size-10 rounded-xl bg-orange-400/10 flex items-center justify-center text-orange-400 border border-orange-400/30 shadow-[0_0_15px_rgba(251,146,60,0.2)]">
                                        <span className="material-symbols-outlined text-[22px]">restore</span>
                                    </div>
                                    <h3 className="text-lg font-bold text-white tracking-tight">Persistence</h3>
                                </div>
                                <button
                                    onClick={() => {
                                        const val = !localRetentionEnabled;
                                        setLocalRetentionEnabled(val);
                                        updatePersistence({ enabled: val, run_interval_hours: localRetentionInterval, keep_days: localRetentionDays });
                                    }}
                                    className={`w-10 h-5 rounded-full relative transition-all ${localRetentionEnabled ? 'bg-primary shadow-[0_0_10px_rgba(37,106,244,0.4)]' : 'bg-white/10'}`}
                                >
                                    <span className={`absolute top-1 size-3 rounded-full transition-all ${localRetentionEnabled ? 'right-1 bg-white' : 'left-1 bg-slate-500'}`}></span>
                                </button>
                            </div>
                            <div className={`space-y-4 transition-all duration-500 ${!localRetentionEnabled ? 'opacity-40 grayscale pointer-events-none blur-[1px]' : ''}`}>
                                <div className="relative">
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Run Frequency (hrs)</label>
                                    <div className="relative flex items-center stepper-container">
                                        <input
                                            className="w-full input-glass !pr-8 font-mono text-xs"
                                            type="number"
                                            value={localRetentionInterval}
                                            onChange={(e) => setLocalRetentionInterval(e.target.value)}
                                            onBlur={(e) => updatePersistence({ enabled: localRetentionEnabled, run_interval_hours: parseInt(e.target.value), keep_days: localRetentionDays })}
                                        />
                                        <div className="absolute right-2 flex flex-col opacity-60">
                                            <span className="material-symbols-outlined text-[12px] stepper-btn" onClick={() => {
                                                const val = parseInt(localRetentionInterval) + 1;
                                                setLocalRetentionInterval(val);
                                                updatePersistence({ enabled: localRetentionEnabled, run_interval_hours: val, keep_days: localRetentionDays });
                                            }}>keyboard_arrow_up</span>
                                            <span className="material-symbols-outlined text-[12px] stepper-btn" onClick={() => {
                                                const val = Math.max(1, parseInt(localRetentionInterval) - 1);
                                                setLocalRetentionInterval(val);
                                                updatePersistence({ enabled: localRetentionEnabled, run_interval_hours: val, keep_days: localRetentionDays });
                                            }}>keyboard_arrow_down</span>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Retention Days</label>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                                        {[
                                            { key: 'ai_safe', label: 'Safe' },
                                            { key: 'new_anomaly', label: 'Threat' },
                                            { key: 'known_threat', label: 'Known' },
                                            { key: 'false_positive', label: 'FP' },
                                            { key: 'misp_alert', label: 'MISP' },
                                            { key: 'ddos_evidence', label: 'DDoS' }
                                        ].map(item => (
                                            <div key={item.key} className="flex items-center justify-between gap-2 border-b border-white/5 pb-1">
                                                <label className="text-slate-500 font-bold uppercase tracking-tighter">{item.label}</label>
                                                <input
                                                    className="w-14 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-white font-mono text-right focus:border-primary/50 outline-none transition-colors"
                                                    type="number"
                                                    value={localRetentionDays[item.key]}
                                                    onChange={(e) => {
                                                        const newVal = parseInt(e.target.value) || 0;
                                                        setLocalRetentionDays(prev => ({ ...prev, [item.key]: newVal }));
                                                    }}
                                                    onBlur={() => updatePersistence({
                                                        enabled: localRetentionEnabled,
                                                        run_interval_hours: localRetentionInterval,
                                                        keep_days: localRetentionDays
                                                    })}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>



                        {/* MISP Integration */}
                        <div className="glass-card rounded-[2rem] p-6 neon-border-rose relative overflow-hidden group">
                            <div className="absolute -right-4 -top-4 size-32 bg-rose-400/20 blur-3xl rounded-full"></div>
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="size-10 rounded-xl bg-rose-400/10 flex items-center justify-center text-rose-400 border border-rose-400/30 shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                                        <span className="material-symbols-outlined text-[22px]">share_reviews</span>
                                    </div>
                                    <h3 className="text-lg font-bold text-white tracking-tight">MISP Integration</h3>
                                </div>
                                <button
                                    onClick={() => {
                                        const val = !localMispEnabled;
                                        setLocalMispEnabled(val);
                                        updateMisp({ misp_enabled: val });
                                    }}
                                    className={`w-10 h-5 rounded-full relative transition-all ${localMispEnabled ? 'bg-primary shadow-[0_0_10px_rgba(37,106,244,0.4)]' : 'bg-white/10'}`}
                                >
                                    <span className={`absolute top-1 size-3 rounded-full transition-all ${localMispEnabled ? 'right-1 bg-white' : 'left-1 bg-slate-500'}`}></span>
                                </button>
                            </div>
                            <div className={`space-y-4 transition-all duration-500 ${!localMispEnabled ? 'opacity-40 grayscale pointer-events-none blur-[1px]' : ''}`}>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Endpoint URL</label>
                                    <input
                                        className="w-full input-glass font-mono text-xs"
                                        placeholder="https://..."
                                        type="text"
                                        value={localMispUrl}
                                        onChange={(e) => setLocalMispUrl(e.target.value)}
                                        onBlur={(e) => updateMisp({ misp_url: e.target.value })}
                                    />
                                </div>
                                <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">SSL Verify</label>
                                    <button
                                        onClick={() => {
                                            const val = !localMispVerify;
                                            setLocalMispVerify(val);
                                            updateMisp({ misp_verify_ssl: val });
                                        }}
                                        className={`w-10 h-5 rounded-full relative transition-all ${localMispVerify ? 'bg-primary shadow-[0_0_10px_rgba(37,106,244,0.4)]' : 'bg-white/10'}`}
                                    >
                                        <span className={`absolute top-1 size-3 rounded-full transition-all ${localMispVerify ? 'right-1 bg-white' : 'left-1 bg-slate-500'}`}></span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Footer Quick Controls */}
            <div className="flex items-center justify-start gap-6 pt-2">
                <div className="glass-card rounded-[2rem] p-6 neon-border-amber flex flex-col gap-4 min-w-[320px] relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 size-32 bg-amber-400/20 blur-3xl rounded-full"></div>
                    <div className="flex items-center gap-4">
                        <div className="size-10 rounded-xl bg-amber-400/10 flex items-center justify-center text-amber-400 border border-amber-400/30 shadow-[0_0_15px_rgba(251,191,36,0.2)]">
                            <span className="material-symbols-outlined text-[20px]">key</span>
                        </div>
                        <h3 className="text-sm font-bold text-white tracking-widest uppercase">API Key</h3>
                    </div>
                    <div className="relative">
                        <input className="w-full input-glass !py-2.5 !px-4 font-mono text-xs tracking-widest bg-black/40" readOnly type="password" defaultValue="••••••••••••••••" />
                        <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-[18px]">visibility</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Bottom Bar Actions */}
            <div className="mt-12 pt-8 border-t border-white/10 flex items-center justify-between lg:hidden">
                <button className="text-slate-400 text-sm font-medium">Reset all to factory defaults</button>
                <button className="bg-primary text-white px-8 py-3 rounded-xl font-bold shadow-[0_0_25px_rgba(37,106,244,0.6)]">Apply All</button>
            </div>
        </main>
    );
}
