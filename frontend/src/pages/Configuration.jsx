import React, { useState, useEffect, useCallback } from 'react';
import { useKinetixData } from '../hooks/useKinetixData';
import './Configuration.css';

export default function Configuration() {
    const [showAdvanced, setShowAdvanced] = useState(false);
    const { data: configData, loading: configLoading, refresh: refreshConfig } = useKinetixData('config');
    const config = configData?.[0] || null;
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null
    const [isInteracting, setIsInteracting] = useState(false);
    const [updating, setUpdating] = useState(false);

    // --- Local State (mirrors config, editable by user) ---
    const [localCheckpointInterval, setLocalCheckpointInterval] = useState(3600);
    const [localMaxCheckpoints, setLocalMaxCheckpoints] = useState(10);
    const [localForensicRate, setLocalForensicRate] = useState(100);
    const [localForensicMode, setLocalForensicMode] = useState('random');
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

    const [localAlertNew, setLocalAlertNew] = useState(true);
    const [localAlertKnown, setLocalAlertKnown] = useState(true);
    const [localAlertFP, setLocalAlertFP] = useState(false);
    const [localStorageSafe, setLocalStorageSafe] = useState(true);
    const [localStorageAnomaly, setLocalStorageAnomaly] = useState(true);

    // --- Sync from server config into local state (only when not dirty/interacting) ---
    useEffect(() => {
        if (updating || isInteracting || !config || isDirty) return;

        if (config.checkpoint_interval_seconds !== undefined) setLocalCheckpointInterval(config.checkpoint_interval_seconds);
        if (config.max_checkpoints_history !== undefined) setLocalMaxCheckpoints(config.max_checkpoints_history);
        if (config.forensic_sample_rate !== undefined) setLocalForensicRate(config.forensic_sample_rate);
        if (config.forensic_sample_mode !== undefined) setLocalForensicMode(config.forensic_sample_mode);
        if (config.ai_context_epochs !== undefined) setLocalContextEpochs(config.ai_context_epochs);
        if (config.ai_anomaly_threshold !== undefined) setLocalAnomalyThreshold(config.ai_anomaly_threshold);
        if (config.port !== undefined) setLocalPort(config.port);
        if (config.time_window !== undefined) setLocalTimeWindow(config.time_window);
        if (config.max_sequence !== undefined) setLocalMaxSequence(config.max_sequence);
        if (config.ddos_threshold !== undefined) setLocalDDoSThreshold(config.ddos_threshold);
        if (config.max_queue_size !== undefined) setLocalMaxQueueSize(config.max_queue_size);
        if (config.retention_policy) {
            setLocalRetentionEnabled(config.retention_policy.enabled);
            setLocalRetentionInterval(config.retention_policy.run_interval_hours);
            if (config.retention_policy.keep_days) setLocalRetentionDays(config.retention_policy.keep_days);
        }
        if (config.memory_dedup_dist !== undefined) setLocalMemDedup(config.memory_dedup_dist);
        if (config.memory_query_dist !== undefined) setLocalMemQuery(config.memory_query_dist);
        if (config.qdrant_path !== undefined) setLocalQdrantPath(config.qdrant_path);
        if (config.qdrant_url !== undefined) setLocalQdrantUrl(config.qdrant_url || "");
        if (config.mongo_uri !== undefined) setLocalMongoUri(config.mongo_uri);
        if (config.misp_enabled !== undefined) setLocalMispEnabled(config.misp_enabled);
        if (config.misp_url !== undefined) setLocalMispUrl(config.misp_url);
        if (config.misp_verify_ssl !== undefined) setLocalMispVerify(config.misp_verify_ssl);
        if (config.alert_policy?.console_alerts) {
            setLocalAlertNew(config.alert_policy.console_alerts.new_anomaly ?? true);
            setLocalAlertKnown(config.alert_policy.console_alerts.known_threat ?? true);
            setLocalAlertFP(config.alert_policy.console_alerts.false_positive ?? false);
        }
        if (config.storage_policy?.save_logs) {
            setLocalStorageSafe(config.storage_policy.save_logs.ai_safe ?? true);
            setLocalStorageAnomaly(config.storage_policy.save_logs.anomaly ?? true);
        }
    }, [config, updating, isInteracting, isDirty]);

    // --- Mark dirty on any local change ---
    const markDirty = useCallback((setter) => {
        return (value) => {
            setter(value);
            setIsDirty(true);
            setSaveStatus(null);
        };
    }, []);

    // --- Build full config payload from ALL local state ---
    const buildPayload = () => ({
        port: parseInt(localPort),
        time_window: parseFloat(localTimeWindow),
        max_sequence: parseInt(localMaxSequence),
        ddos_threshold: parseInt(localDDoSThreshold),
        max_queue_size: parseInt(localMaxQueueSize),
        ai_context_epochs: parseInt(localContextEpochs),
        ai_anomaly_threshold: parseFloat(localAnomalyThreshold),
        qdrant_path: localQdrantPath,
        qdrant_url: localQdrantUrl || null,
        mongo_uri: localMongoUri,
        memory_dedup_dist: parseFloat(localMemDedup),
        memory_query_dist: parseFloat(localMemQuery),
        ai_checkpoint_file: config?.ai_checkpoint_file || "auto",
        checkpoint_interval_seconds: parseInt(localCheckpointInterval),
        max_checkpoints_history: parseInt(localMaxCheckpoints),
        forensic_sample_rate: parseInt(localForensicRate),
        forensic_sample_mode: localForensicMode,
        misp_enabled: localMispEnabled,
        misp_url: localMispUrl,
        misp_verify_ssl: localMispVerify,
        storage_policy: {
            save_vectors: {
                ai_safe: localStorageSafe,
                anomaly: localStorageAnomaly
            },
            save_logs: {
                ai_safe: localStorageSafe,
                anomaly: localStorageAnomaly,
                ddos_evidence: config?.storage_policy?.save_logs?.ddos_evidence ?? true
            }
        },
        alert_policy: {
            misp_report: config?.alert_policy?.misp_report ?? true,
            console_alerts: {
                new_anomaly: localAlertNew,
                known_threat: localAlertKnown,
                false_positive: localAlertFP
            }
        },
        retention_policy: {
            enabled: localRetentionEnabled,
            run_interval_hours: parseInt(localRetentionInterval),
            keep_days: localRetentionDays
        }
    });

    // --- Single Apply Handler ---
    const handleApply = async () => {
        setSaving(true);
        setSaveStatus(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:8000/api/v1/data/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(buildPayload())
            });
            if (res.ok) {
                setIsDirty(false);
                setSaveStatus('success');
                refreshConfig();
                setTimeout(() => setSaveStatus(null), 3000);
            } else {
                setSaveStatus('error');
            }
        } catch (err) {
            console.error("Failed to save config", err);
            setSaveStatus('error');
        } finally {
            setSaving(false);
        }
    };

    // --- Reset to curated production defaults ---
    const handleReset = () => {
        // Network & Brain
        setLocalPort(5001);
        setLocalTimeWindow(5.0);
        setLocalMaxSequence(100);
        setLocalDDoSThreshold(50);
        setLocalMaxQueueSize(10000);

        // AI Engine — 0.85 balances detection rate vs false-positive noise
        setLocalContextEpochs(5);
        setLocalAnomalyThreshold(0.85);

        // Checkpointing — hourly saves, keep last 5 snapshots
        setLocalCheckpointInterval(3600);
        setLocalMaxCheckpoints(5);

        // Forensics — full capture in random mode for unbiased sampling
        setLocalForensicRate(100);
        setLocalForensicMode('random');

        // Memory — tight dedup, wider query radius
        setLocalMemDedup(0.05);
        setLocalMemQuery(0.15);

        // Database — local defaults
        setLocalQdrantPath("DB/vector");
        setLocalQdrantUrl("");
        setLocalMongoUri("mongodb://localhost:27017/");

        // Alerts — surface threats, suppress known-safe noise
        setLocalAlertNew(true);
        setLocalAlertKnown(true);
        setLocalAlertFP(false);

        // Storage — persist everything for audit trail
        setLocalStorageSafe(true);
        setLocalStorageAnomaly(true);

        // MISP — disabled by default (requires external server)
        setLocalMispEnabled(false);
        setLocalMispUrl("https://misp.local");
        setLocalMispVerify(true);

        // Retention — tiered: safe=7d, anomalies=90d, threats=365d
        setLocalRetentionEnabled(true);
        setLocalRetentionInterval(24);
        setLocalRetentionDays({
            ai_safe: 7,
            new_anomaly: 90,
            known_threat: 365,
            false_positive: 3,
            misp_alert: 365,
            ddos_evidence: 14
        });

        setIsDirty(true);
        setSaveStatus(null);
    };

    if (configLoading && !config) return <div className="p-8 text-slate-400">Loading configuration...</div>;

    return (
        <main className="flex-1 pt-28 pb-8 px-8 max-w-[1440px] mx-auto w-full">
            <div className="flex items-end justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">System Configuration</h2>
                    <p className="text-slate-400 text-sm">Fine-tune the security engine and network protocols.</p>
                </div>
                <div className="flex gap-4 items-center">
                    {isDirty && (
                        <span className="text-xs text-amber-400 flex items-center gap-1 animate-pulse">
                            <span className="material-symbols-outlined text-[14px]">warning</span>
                            Unsaved changes
                        </span>
                    )}
                    {saveStatus === 'success' && (
                        <span className="text-xs text-emerald-400 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">check_circle</span>
                            Saved
                        </span>
                    )}
                    {saveStatus === 'error' && (
                        <span className="text-xs text-red-400 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">error</span>
                            Save failed
                        </span>
                    )}
                    <button
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl border transition-all text-sm font-medium group ${showAdvanced ? 'bg-primary/20 text-primary border-primary/30' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}
                        onClick={() => setShowAdvanced(!showAdvanced)}
                    >
                        <span className={`material-symbols-outlined text-[18px] transition-transform ${showAdvanced ? 'rotate-90' : 'group-hover:rotate-45'}`}>settings</span>
                        Advanced Settings
                    </button>
                    <button
                        className="px-6 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 transition-all text-sm font-medium"
                        onClick={handleReset}
                    >
                        Reset Defaults
                    </button>
                    <button
                        className={`px-6 py-2.5 rounded-xl text-white transition-all text-sm font-semibold ${isDirty ? 'bg-primary shadow-[0_0_20px_rgba(37,106,244,0.5)] hover:brightness-110' : 'bg-white/10 text-slate-500 cursor-not-allowed'}`}
                        onClick={handleApply}
                        disabled={!isDirty || saving}
                    >
                        {saving ? 'Saving...' : 'Apply Changes'}
                    </button>
                </div>
            </div>

            {/* Upper Config Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12 items-start">
                {/* 1. Alert Management */}
                <div className="glass-card rounded-[2rem] p-6 flex flex-col gap-6 neon-border-cyan relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 size-32 bg-primary/20 blur-3xl rounded-full"></div>
                    <div className="flex items-center gap-4 relative z-10 transition-all duration-500">
                        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/30 shadow-[0_0_15px_rgba(37,106,244,0.2)]">
                            <span className="material-symbols-outlined text-[22px]">notification_important</span>
                        </div>
                        <h3 className="text-lg font-bold text-white tracking-tight">Alert Management</h3>
                    </div>
                    <div className="space-y-4 relative z-10">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">New Alerts</span>
                            <button
                                onClick={() => markDirty(setLocalAlertNew)(!localAlertNew)}
                                className={`w-10 h-5 rounded-full relative transition-all ${localAlertNew ? 'bg-primary shadow-[0_0_10px_rgba(37,106,244,0.5)]' : 'bg-white/10'}`}>
                                <span className={`absolute top-1 size-3 rounded-full transition-all ${localAlertNew ? 'right-1 bg-white' : 'left-1 bg-slate-400'}`}></span>
                            </button>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Known Alerts</span>
                            <button
                                onClick={() => markDirty(setLocalAlertKnown)(!localAlertKnown)}
                                className={`w-10 h-5 rounded-full relative transition-all ${localAlertKnown ? 'bg-primary shadow-[0_0_10px_rgba(37,106,244,0.5)]' : 'bg-white/10'}`}>
                                <span className={`absolute top-1 size-3 rounded-full transition-all ${localAlertKnown ? 'right-1 bg-white' : 'left-1 bg-slate-400'}`}></span>
                            </button>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">FP Alerts</span>
                            <button
                                onClick={() => markDirty(setLocalAlertFP)(!localAlertFP)}
                                className={`w-10 h-5 rounded-full relative transition-all ${localAlertFP ? 'bg-primary shadow-[0_0_10px_rgba(37,106,244,0.5)]' : 'bg-white/10'}`}>
                                <span className={`absolute top-1 size-3 rounded-full transition-all ${localAlertFP ? 'right-1 bg-white' : 'left-1 bg-slate-400'}`}></span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* 2. Role Management */}
                <div className="glass-card rounded-[2rem] p-6 flex flex-col gap-4 neon-border-cyan relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 size-32 bg-accent-purple/20 blur-3xl rounded-full"></div>
                    <div className="flex items-center justify-between relative z-10 transition-all duration-500">
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-accent-purple/10 flex items-center justify-center text-accent-purple border border-accent-purple/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                                <span className="material-symbols-outlined text-[22px]">shield_person</span>
                            </div>
                            <h3 className="text-lg font-bold text-white tracking-tight">Role Management</h3>
                        </div>
                        <button className="size-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors border border-white/10">
                            <span className="material-symbols-outlined text-xl text-white">add</span>
                        </button>
                    </div>
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">search</span>
                        <input className="w-full input-glass !pl-10 !py-2" placeholder="Search roles..." type="text" />
                    </div>
                    <div className="space-y-2 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
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
                <div className="glass-card rounded-[2rem] p-6 flex flex-col gap-6 neon-border-cyan relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 size-32 bg-primary/20 blur-3xl rounded-full"></div>
                    <div className="flex items-center gap-4 relative z-10 transition-all duration-500">
                        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/30 shadow-[0_0_15px_rgba(37,106,244,0.2)]">
                            <span className="material-symbols-outlined text-[22px]">database</span>
                        </div>
                        <h3 className="text-lg font-bold text-white tracking-tight">Log Storage</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                            <span className="text-xs text-slate-400">Safe</span>
                            <button
                                onClick={() => markDirty(setLocalStorageSafe)(!localStorageSafe)}
                                className={`w-8 h-4 rounded-full relative transition-all ${localStorageSafe ? 'bg-primary shadow-[0_0_8px_rgba(37,106,244,0.4)]' : 'bg-white/10'}`}>
                                <span className={`absolute top-0.5 size-3 rounded-full transition-all ${localStorageSafe ? 'right-0.5 bg-white' : 'left-0.5 bg-slate-400'}`}></span>
                            </button>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                            <span className="text-xs text-slate-400">Threat</span>
                            <button
                                onClick={() => markDirty(setLocalStorageAnomaly)(!localStorageAnomaly)}
                                className={`w-8 h-4 rounded-full relative transition-all ${localStorageAnomaly ? 'bg-primary shadow-[0_0_8px_rgba(37,106,244,0.4)]' : 'bg-white/10'}`}>
                                <span className={`absolute top-0.5 size-3 rounded-full transition-all ${localStorageAnomaly ? 'right-0.5 bg-white' : 'left-0.5 bg-slate-400'}`}></span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* 4. Checkpointing */}
                <div className="glass-card rounded-[2rem] p-6 flex flex-col gap-6 neon-border-cyan relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 size-32 bg-primary/20 blur-3xl rounded-full"></div>
                    <div className="flex items-center gap-4 relative z-10 transition-all duration-500">
                        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/30 shadow-[0_0_15px_rgba(37,106,244,0.2)]">
                            <span className="material-symbols-outlined text-[22px]">save</span>
                        </div>
                        <h3 className="text-lg font-bold text-white tracking-tight">Checkpointing</h3>
                    </div>
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-sm text-slate-300">Auto-save frequency</label>
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
                                onMouseDown={() => setIsInteracting(true)}
                                onChange={(e) => { setLocalCheckpointInterval(e.target.value); setIsDirty(true); setSaveStatus(null); }}
                                onMouseUp={() => setIsInteracting(false)}
                            />
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-sm text-slate-300">History Rotation</label>
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
                                onMouseDown={() => setIsInteracting(true)}
                                onChange={(e) => { setLocalMaxCheckpoints(e.target.value); setIsDirty(true); setSaveStatus(null); }}
                                onMouseUp={() => setIsInteracting(false)}
                            />
                        </div>
                    </div>
                </div>

                {/* 5. Forensics Control */}
                <div className="glass-card rounded-[2rem] p-6 flex flex-col gap-6 neon-border-cyan relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 size-32 bg-amber-400/20 blur-3xl rounded-full"></div>
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="size-10 rounded-xl bg-amber-400/10 flex items-center justify-center text-amber-400 border border-amber-400/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                            <span className="material-symbols-outlined text-[22px]">fingerprint</span>
                        </div>
                        <h3 className="text-lg font-bold text-white tracking-tight">Forensics Control</h3>
                    </div>
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-sm text-slate-300">Sample Rate (%)</label>
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
                                onMouseDown={() => setIsInteracting(true)}
                                onChange={(e) => { setLocalForensicRate(parseInt(e.target.value) || 0); setIsDirty(true); setSaveStatus(null); }}
                                onMouseUp={() => setIsInteracting(false)}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Mode</span>
                            <div className="flex p-1 bg-white/5 rounded-xl border border-white/10">
                                <button
                                    onClick={() => markDirty(setLocalForensicMode)('random')}
                                    className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${localForensicMode === 'random' ? 'bg-primary text-white shadow-[0_0_10px_rgba(37,106,244,0.3)]' : 'text-slate-500 hover:text-slate-300'}`}>
                                    RANDOM
                                </button>
                                <button
                                    onClick={() => markDirty(setLocalForensicMode)('sequence')}
                                    className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${localForensicMode === 'sequence' ? 'bg-primary text-white shadow-[0_0_10px_rgba(37,106,244,0.3)]' : 'text-slate-500 hover:text-slate-300'}`}>
                                    SEQ
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 6. AI Engine */}
                <div className="glass-card rounded-[2rem] p-6 neon-border-cyan relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 size-32 bg-emerald-400/20 blur-3xl rounded-full"></div>
                    <div className="flex items-center gap-4 mb-6 relative z-10">
                        <div className="size-10 rounded-xl bg-emerald-400/10 flex items-center justify-center text-emerald-400 border border-emerald-400/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                            <span className="material-symbols-outlined text-[22px]">neurology</span>
                        </div>
                        <h3 className="text-lg font-bold text-white tracking-tight">AI Engine</h3>
                    </div>
                    <div className="space-y-5 relative z-10">
                        <div>
                            <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Context Epochs</label>
                            <div className="relative flex items-center stepper-container">
                                <input
                                    className="w-full input-glass text-xs font-mono !pr-8"
                                    type="number"
                                    value={localContextEpochs}
                                    onFocus={() => setIsInteracting(true)}
                                    onChange={(e) => { setLocalContextEpochs(e.target.value); setIsDirty(true); setSaveStatus(null); }}
                                    onBlur={() => setIsInteracting(false)}
                                />
                                <div className="absolute right-2 flex flex-col opacity-60">
                                    <span className="material-symbols-outlined text-[12px] stepper-btn" onClick={() => {
                                        const val = parseInt(localContextEpochs) + 1;
                                        setLocalContextEpochs(val); setIsDirty(true); setSaveStatus(null);
                                    }}>keyboard_arrow_up</span>
                                    <span className="material-symbols-outlined text-[12px] stepper-btn" onClick={() => {
                                        const val = Math.max(1, parseInt(localContextEpochs) - 1);
                                        setLocalContextEpochs(val); setIsDirty(true); setSaveStatus(null);
                                    }}>keyboard_arrow_down</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <label className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider !mb-0">Anomaly Sensitivity</label>
                                <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/30 shadow-[0_0_10px_rgba(16,185,129,0.3)]">
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
                                onMouseDown={() => setIsInteracting(true)}
                                onChange={(e) => { setLocalAnomalyThreshold(e.target.value); setIsDirty(true); setSaveStatus(null); }}
                                onMouseUp={() => setIsInteracting(false)}
                            />
                        </div>
                    </div>
                </div>

                {/* 8. MISP Integration */}
                <div className="glass-card rounded-[2rem] p-6 neon-border-cyan relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 size-32 bg-red-400/20 blur-3xl rounded-full"></div>
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-red-400/10 flex items-center justify-center text-red-400 border border-red-400/30 shadow-[0_0_15px_rgba(248,113,113,0.2)]">
                                <span className="material-symbols-outlined text-[22px]">share_reviews</span>
                            </div>
                            <h3 className="text-lg font-bold text-white tracking-tight">MISP Integration</h3>
                        </div>
                        <button
                            onClick={() => {
                                const val = !localMispEnabled;
                                setLocalMispEnabled(val);
                                setIsDirty(true);
                                setSaveStatus(null);
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
                                className="w-full input-glass text-xs font-mono"
                                placeholder="https://..."
                                type="text"
                                value={localMispUrl}
                                onFocus={() => setIsInteracting(true)}
                                onChange={(e) => setLocalMispUrl(e.target.value)}
                                onBlur={() => {
                                    setIsInteracting(false);
                                    setIsDirty(true);
                                    setSaveStatus(null);
                                }}
                            />
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">SSL Verify</label>
                            <button
                                onClick={() => {
                                    const val = !localMispVerify;
                                    setLocalMispVerify(val);
                                    setIsDirty(true);
                                    setSaveStatus(null);
                                }}
                                className={`w-10 h-5 rounded-full relative transition-all ${localMispVerify ? 'bg-primary shadow-[0_0_10px_rgba(37,106,244,0.4)]' : 'bg-white/10'}`}
                            >
                                <span className={`absolute top-1 size-3 rounded-full transition-all ${localMispVerify ? 'right-1 bg-white' : 'left-1 bg-slate-500'}`}></span>
                            </button>
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
                                    <input className="w-full input-glass text-xs font-mono" type="text" value={localQdrantPath}
                                        onFocus={() => setIsInteracting(true)}
                                        onChange={(e) => { setLocalQdrantPath(e.target.value); setIsDirty(true); setSaveStatus(null); }}
                                        onBlur={() => setIsInteracting(false)} />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Qdrant URL (optional)</label>
                                    <input className="w-full input-glass text-xs font-mono" placeholder="null" type="text" value={localQdrantUrl}
                                        onFocus={() => setIsInteracting(true)}
                                        onChange={(e) => { setLocalQdrantUrl(e.target.value); setIsDirty(true); setSaveStatus(null); }}
                                        onBlur={() => setIsInteracting(false)} />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Mongo URI</label>
                                    <input className="w-full input-glass text-xs font-mono" type="text" value={localMongoUri}
                                        onFocus={() => setIsInteracting(true)}
                                        onChange={(e) => { setLocalMongoUri(e.target.value); setIsDirty(true); setSaveStatus(null); }}
                                        onBlur={() => setIsInteracting(false)} />
                                </div>
                            </div>
                        </div>

                        {/* Network */}
                        <div className="glass-card rounded-[2rem] p-6 neon-border-cyan relative overflow-hidden group">
                            <div className="absolute -right-4 -top-4 size-32 bg-primary/20 blur-3xl rounded-full"></div>
                            <div className="flex items-center gap-4 mb-6">
                                <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/30 shadow-[0_0_15px_rgba(37,106,244,0.2)]">
                                    <span className="material-symbols-outlined text-[22px]">router</span>
                                </div>
                                <h3 className="text-lg font-bold text-white tracking-tight">Network</h3>
                            </div>
                            <div className="space-y-5">
                                <div className="relative">
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Service Port</label>
                                    <div className="relative flex items-center stepper-container">
                                        <input className="w-full input-glass !pr-12 text-xs font-mono" id="port-input" placeholder="Enter port..." type="number"
                                            value={localPort}
                                            onFocus={() => setIsInteracting(true)}
                                            onChange={(e) => { setLocalPort(e.target.value); setIsDirty(true); setSaveStatus(null); }}
                                            onBlur={() => setIsInteracting(false)} />
                                        <div className="absolute right-2 flex flex-col gap-0.5 opacity-60">
                                            <span className="material-symbols-outlined text-[14px] stepper-btn font-bold" onClick={() => {
                                                const val = parseInt(localPort) + 1;
                                                setLocalPort(val); setIsDirty(true); setSaveStatus(null);
                                            }}>add</span>
                                            <span className="material-symbols-outlined text-[14px] stepper-btn font-bold" onClick={() => {
                                                const val = Math.max(1, parseInt(localPort) - 1);
                                                setLocalPort(val); setIsDirty(true); setSaveStatus(null);
                                            }}>remove</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Brain Logic */}
                        <div className="glass-card rounded-[2rem] p-6 neon-border-cyan relative overflow-hidden group">
                            <div className="absolute -right-4 -top-4 size-32 bg-emerald-400/20 blur-3xl rounded-full"></div>
                            <div className="flex items-center gap-4 mb-6">
                                <div className="size-10 rounded-xl bg-emerald-400/10 flex items-center justify-center text-emerald-400 border border-emerald-400/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                                    <span className="material-symbols-outlined text-[22px]">psychology</span>
                                </div>
                                <h3 className="text-lg font-bold text-white tracking-tight">Brain Logic</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-1">
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Time Win</label>
                                    <div className="relative flex items-center stepper-container">
                                        <input className="w-full input-glass !pr-8 text-xs font-mono" id="timewin-input" step="0.1" type="number"
                                            value={localTimeWindow}
                                            onFocus={() => setIsInteracting(true)}
                                            onChange={(e) => { setLocalTimeWindow(e.target.value); setIsDirty(true); setSaveStatus(null); }}
                                            onBlur={() => setIsInteracting(false)} />
                                    </div>
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Max Seq</label>
                                    <div className="relative flex items-center stepper-container">
                                        <input className="w-full input-glass !pr-8 text-xs font-mono" id="maxseq-input" type="number"
                                            value={localMaxSequence}
                                            onFocus={() => setIsInteracting(true)}
                                            onChange={(e) => { setLocalMaxSequence(e.target.value); setIsDirty(true); setSaveStatus(null); }}
                                            onBlur={() => setIsInteracting(false)} />
                                    </div>
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">DDoS Thr</label>
                                    <div className="relative flex items-center stepper-container">
                                        <input className="w-full input-glass !pr-8 text-xs font-mono" id="ddos-input" type="number"
                                            value={localDDoSThreshold}
                                            onFocus={() => setIsInteracting(true)}
                                            onChange={(e) => { setLocalDDoSThreshold(e.target.value); setIsDirty(true); setSaveStatus(null); }}
                                            onBlur={() => setIsInteracting(false)} />
                                    </div>
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Queue Sz</label>
                                    <div className="relative flex items-center stepper-container">
                                        <input className="w-full input-glass !pr-8 text-xs font-mono" id="queue-input" type="number"
                                            value={localMaxQueueSize}
                                            onFocus={() => setIsInteracting(true)}
                                            onChange={(e) => { setLocalMaxQueueSize(e.target.value); setIsDirty(true); setSaveStatus(null); }}
                                            onBlur={() => setIsInteracting(false)} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Retention */}
                        <div className="glass-card rounded-[2rem] p-6 neon-border-cyan relative overflow-hidden group">
                            <div className="absolute -right-4 -top-4 size-32 bg-primary/20 blur-3xl rounded-full"></div>
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/30 shadow-[0_0_15px_rgba(37,106,244,0.2)]">
                                        <span className="material-symbols-outlined text-[22px]">history</span>
                                    </div>
                                    <h3 className="text-lg font-bold text-white tracking-tight">Retention</h3>
                                </div>
                                <button
                                    onClick={() => markDirty(setLocalRetentionEnabled)(!localRetentionEnabled)}
                                    className={`w-10 h-5 rounded-full relative transition-all ${localRetentionEnabled ? 'bg-primary shadow-[0_0_10px_rgba(37,106,244,0.4)]' : 'bg-white/10'}`}>
                                    <span className={`absolute top-1 size-3 rounded-full transition-all ${localRetentionEnabled ? 'right-1 bg-white' : 'left-1 bg-slate-500'}`}></span>
                                </button>
                            </div>
                            <div className={`space-y-4 ${!localRetentionEnabled ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Run Interval (hours)</label>
                                    <input className="w-full input-glass text-xs font-mono" type="number" value={localRetentionInterval}
                                        onFocus={() => setIsInteracting(true)}
                                        onChange={(e) => { setLocalRetentionInterval(e.target.value); setIsDirty(true); setSaveStatus(null); }}
                                        onBlur={() => setIsInteracting(false)} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
