import React, { useState, useEffect, useCallback } from 'react';
import { useKinetixData } from '../hooks/useKinetixData';
import './Configuration.css';

export default function Configuration() {
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [config, setConfig] = useState(null);
    const [configLoading, setConfigLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null
    const [isInteracting, setIsInteracting] = useState(false);
    const [updating, setUpdating] = useState(false);

    const refreshConfig = useCallback(async () => {
        try {
            setConfigLoading(true);
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:8000/api/v1/data/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ limit: 1 })
            });
            if (res.ok) {
                const json = await res.json();
                setConfig(json.data?.[0] || null);
            }
        } catch (err) {
            console.error('Failed to load config:', err);
        } finally {
            setConfigLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshConfig();
    }, [refreshConfig]);

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

    // --- Add Role Modal State ---
    const [showAddRole, setShowAddRole] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');
    const [newRoleIP, setNewRoleIP] = useState('');
    const [newRoleMask, setNewRoleMask] = useState('24');
    const [newRoleServers, setNewRoleServers] = useState(0);
    const [newRoleRouters, setNewRoleRouters] = useState(0);
    const [newRoleSwitches, setNewRoleSwitches] = useState(0);
    const [newRoleFirewalls, setNewRoleFirewalls] = useState(0);
    const [newRolePCs, setNewRolePCs] = useState(0);
    const [newRoleFactor, setNewRoleFactor] = useState(0.5);

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

    return (
        <main className="flex-1 pt-28 pb-8 px-8 max-w-[1440px] mx-auto w-full">
            <div className="flex items-end justify-end mb-8">
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

            {/* Upper Config Grid — 6-col grid for optimised card sizing */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-8 mb-12">

                {/* 1. Alert Management — compact, 2 cols */}
                <div className="lg:col-span-2 glass-card rounded-[2rem] p-6 flex flex-col gap-6 neon-border-cyan relative overflow-hidden group">
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

                {/* 2. Role Management — tall card, 2 cols, spans 2 rows */}
                <div className="lg:col-span-2 lg:row-span-2 glass-card rounded-[2rem] p-6 flex flex-col gap-4 neon-border-cyan relative overflow-hidden group h-full">
                    <div className="absolute -right-4 -top-4 size-32 bg-accent-purple/20 blur-3xl rounded-full"></div>
                    <div className="flex items-center justify-between relative z-10 transition-all duration-500">
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-accent-purple/10 flex items-center justify-center text-accent-purple border border-accent-purple/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                                <span className="material-symbols-outlined text-[22px]">shield_person</span>
                            </div>
                            <h3 className="text-lg font-bold text-white tracking-tight">Role Management</h3>
                        </div>
                        <button
                            onClick={() => setShowAddRole(true)}
                            className="size-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors border border-white/10"
                        >
                            <span className="material-symbols-outlined text-xl text-white">add</span>
                        </button>
                    </div>
                    <div className="relative">
                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">search</span>
                        <input className="w-full input-glass !pl-10 !py-2" placeholder="Search roles..." type="text" />
                    </div>
                    <div className="space-y-2 overflow-y-auto flex-1 pr-2 custom-scrollbar">
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

                {/* 4. Log Storage Control — compact, 2 cols (Moved up) */}
                <div className="lg:col-span-2 glass-card rounded-[2rem] p-6 flex flex-col gap-6 neon-border-cyan relative overflow-hidden group">
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

                {/* 3. Checkpointing — 2 cols (Moved down) */}
                <div className="lg:col-span-2 glass-card rounded-[2rem] p-6 flex flex-col gap-6 neon-border-cyan relative overflow-hidden group">
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

                {/* 5. Forensics Control — 2 cols */}
                <div className="lg:col-span-2 glass-card rounded-[2rem] p-6 flex flex-col gap-6 neon-border-cyan relative overflow-hidden group">
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

                {/* 6. AI Engine — 2 cols */}
                <div className="lg:col-span-2 glass-card rounded-[2rem] p-6 neon-border-cyan relative overflow-hidden group">
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

                {/* 7. MISP Integration — 2 cols */}
                <div className="lg:col-span-2 glass-card rounded-[2rem] p-6 neon-border-cyan relative overflow-hidden group">
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
                {/* 8. Database — 2 cols (Moved from Advanced) */}
                <div className="lg:col-span-2 glass-card rounded-[2rem] p-6 neon-border-cyan relative overflow-hidden group">
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

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">


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
                            <div className={`space-y-4 transition-all duration-500 ${!localRetentionEnabled ? 'opacity-40 grayscale pointer-events-none blur-[1px]' : ''}`}>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Run Interval (hours)</label>
                                    <input className="w-full input-glass text-xs font-mono" type="number" value={localRetentionInterval}
                                        onFocus={() => setIsInteracting(true)}
                                        onChange={(e) => { setLocalRetentionInterval(e.target.value); setIsDirty(true); setSaveStatus(null); }}
                                        onBlur={() => setIsInteracting(false)} />
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
                                                <label className="text-slate-500 font-mono">{item.label}</label>
                                                <input
                                                    className="w-14 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-white font-mono text-right focus:border-primary/50 outline-none transition-colors"
                                                    type="number"
                                                    value={localRetentionDays[item.key] || 0}
                                                    onChange={(e) => {
                                                        const newVal = parseInt(e.target.value) || 0;
                                                        setLocalRetentionDays(prev => ({ ...prev, [item.key]: newVal }));
                                                        setIsDirty(true); setSaveStatus(null);
                                                    }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}


            {/* Mobile Bottom Bar Actions */}
            <div className="mt-12 pt-8 border-t border-white/10 flex items-center justify-between lg:hidden">
                <button className="text-slate-400 text-sm font-medium" onClick={() => { setIsDirty(true); }}>Reset all to factory defaults</button>
                <button
                    className={`px-8 py-3 rounded-xl font-bold ${isDirty ? 'bg-primary text-white shadow-[0_0_25px_rgba(37,106,244,0.6)]' : 'bg-white/10 text-slate-500 cursor-not-allowed'}`}
                    onClick={() => { setSaveStatus('success'); setIsDirty(false); }}
                    disabled={!isDirty || saving}
                >
                    {saving ? 'Saving...' : 'Apply All'}
                </button>
            </div>
            {/* Add Role Modal */}
            <AddRoleModal
                isOpen={showAddRole}
                onClose={() => setShowAddRole(false)}
                state={{
                    name: newRoleName,
                    ip: newRoleIP,
                    mask: newRoleMask,
                    servers: newRoleServers,
                    routers: newRoleRouters,
                    switches: newRoleSwitches,
                    firewalls: newRoleFirewalls,
                    pcs: newRolePCs,
                    factor: newRoleFactor
                }}
                setters={{
                    setName: setNewRoleName,
                    setIp: setNewRoleIP,
                    setMask: setNewRoleMask,
                    setServers: setNewRoleServers,
                    setRouters: setNewRoleRouters,
                    setSwitches: setNewRoleSwitches,
                    setFirewalls: setNewRoleFirewalls,
                    setPcs: setNewRolePCs,
                    setFactor: setNewRoleFactor
                }}
            />
        </main>
    );
}

// Sub-component for the Add Role Modal
function AddRoleModal({ isOpen, onClose, state, setters }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Overlay */}
            <div
                className="absolute inset-0 bg-slate-950/40 backdrop-blur-md"
                onClick={onClose}
            ></div>

            {/* Modal Card */}
            <div className="relative w-full max-w-2xl glass-card rounded-[2.5rem] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.3)] overflow-hidden animate-in fade-in zoom-in duration-300">
                <div className="absolute -right-20 -top-20 size-80 bg-primary/10 blur-[100px] rounded-full"></div>

                <div className="p-8 relative z-10">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-[0_0_20px_rgba(37,106,244,0.2)]">
                                <span className="material-symbols-outlined text-2xl">shield_person</span>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white tracking-tight">Create New System Role</h2>
                                <p className="text-slate-400 text-sm">Define operational parameters and hardware constraints.</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="size-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all text-slate-400 hover:text-white border border-white/10"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Identity & Network */}
                        <div className="space-y-5">
                            <div className="flex items-center gap-1.5 mb-2 px-1">
                                <h3 className="text-xs font-bold text-primary uppercase tracking-[0.2em]">Identity & Network</h3>
                                <div className="group/id-tip relative flex items-center">
                                    <span className="material-symbols-outlined text-[14px] text-slate-500 cursor-help hover:text-primary transition-colors">info</span>
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-xl bg-slate-900/95 backdrop-blur-md border border-white/10 text-[10px] text-slate-300 leading-relaxed opacity-0 group-hover/id-tip:opacity-100 pointer-events-none transition-all z-50 shadow-2xl scale-95 group-hover/id-tip:scale-100 origin-bottom">
                                        Each role must have a unique identifier and its own network range. Multiple roles can share the same Strategic Factor if they perform identical operational functions.
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Role Name</label>
                                    <input
                                        className="w-full input-glass"
                                        placeholder="e.g. Threat Hunter"
                                        type="text"
                                        value={state.name}
                                        onChange={(e) => setters.setName(e.target.value)}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">IP Address</label>
                                        <input
                                            className="w-full input-glass font-mono text-xs"
                                            placeholder="10.0.0.0"
                                            type="text"
                                            value={state.ip}
                                            onChange={(e) => setters.setIp(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Subnet Mask</label>
                                        <input
                                            className="w-full input-glass font-mono text-xs"
                                            placeholder="24"
                                            type="text"
                                            value={state.mask}
                                            onChange={(e) => setters.setMask(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-2">
                                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Strategic Factor (0-1)</label>
                                            <div className="group/tip relative flex items-center">
                                                <span className="material-symbols-outlined text-[14px] text-slate-500 cursor-help hover:text-primary transition-colors">info</span>
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-xl bg-slate-900/95 backdrop-blur-md border border-white/10 text-[10px] text-slate-300 leading-relaxed opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-all z-50 shadow-2xl scale-95 group-hover/tip:scale-100 origin-bottom">
                                                    Assign a unique value based on the role's specific function. The more distinct or unique a role's behavior, the further its Strategic Factor should be from other roles.
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <input
                                                className="flex-1 accent-primary"
                                                max="1"
                                                min="0"
                                                step="0.0001"
                                                type="range"
                                                value={state.factor}
                                                onChange={(e) => setters.setFactor(e.target.value)}
                                            />
                                            <input
                                                className="w-24 text-sm font-mono text-primary bg-primary/10 px-2 py-1 rounded border border-primary/20 text-center focus:outline-none focus:border-primary/50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                max="1"
                                                min="0"
                                                step="0.0001"
                                                type="number"
                                                value={state.factor}
                                                onChange={(e) => setters.setFactor(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Hardware Constraints */}
                        <div className="space-y-5">
                            <div className="flex items-center gap-1.5 mb-2 px-1">
                                <h3 className="text-xs font-bold text-primary uppercase tracking-[0.2em]">Hardware Constraints</h3>
                                <div className="group/hw-tip relative flex items-center">
                                    <span className="material-symbols-outlined text-[14px] text-slate-500 cursor-help hover:text-primary transition-colors">info</span>
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-xl bg-slate-900/95 backdrop-blur-md border border-white/10 text-[10px] text-slate-300 leading-relaxed opacity-0 group-hover/hw-tip:opacity-100 pointer-events-none transition-all z-50 shadow-2xl scale-95 group-hover/hw-tip:scale-100 origin-bottom">
                                        Define the maximum capacity for each hardware type. You will receive an alert if the deployed infrastructure exceeds these limits.
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { label: 'Servers', key: 'servers', icon: 'dns' },
                                    { label: 'Routers', key: 'routers', icon: 'router' },
                                    { label: 'Switches', key: 'switches', icon: 'settings_input_component' },
                                    { label: 'Firewalls', key: 'firewalls', icon: 'security' },
                                    { label: 'PCs', key: 'pcs', icon: 'desktop_windows' },
                                ].map(item => (
                                    <div key={item.key} className="flex flex-col items-center p-3 rounded-2xl bg-white/5 border border-white/10 group/hw hover:bg-white/[0.07] transition-all">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="material-symbols-outlined text-[18px] text-primary/70">{item.icon}</span>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.label}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => setters[`set${item.key.charAt(0).toUpperCase() + item.key.slice(1)}`](Math.max(0, parseInt(state[item.key]) - 1))}
                                                className="size-7 rounded-lg bg-white/5 flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 transition-all border border-white/5 active:scale-90"
                                            >
                                                <span className="material-symbols-outlined text-sm font-bold">remove</span>
                                            </button>
                                            <input
                                                className="w-12 bg-white/5 rounded-lg border border-white/10 text-sm font-mono font-bold text-white text-center focus:outline-none hover:border-primary/30 focus:border-primary/50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none py-1"
                                                type="number"
                                                value={state[item.key]}
                                                onChange={(e) => setters[`set${item.key.charAt(0).toUpperCase() + item.key.slice(1)}`](parseInt(e.target.value) || 0)}
                                            />
                                            <button
                                                onClick={() => setters[`set${item.key.charAt(0).toUpperCase() + item.key.slice(1)}`](parseInt(state[item.key]) + 1)}
                                                className="size-7 rounded-lg bg-white/5 flex items-center justify-center hover:bg-green-500/20 hover:text-green-400 transition-all border border-white/5 active:scale-90"
                                            >
                                                <span className="material-symbols-outlined text-sm font-bold">add</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="mt-10 flex items-center justify-end gap-4">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all text-sm font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onClose}
                            className="px-8 py-2.5 rounded-xl bg-primary text-white font-bold shadow-[0_0_20px_rgba(37,106,244,0.4)] hover:brightness-110 transition-all text-sm"
                        >
                            Create Role
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
