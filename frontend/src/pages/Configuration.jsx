import React, { useState } from 'react';

export default function Configuration() {
    const [autonomyLevel, setAutonomyLevel] = useState(3);
    const [heuristics, setHeuristics] = useState(true);
    const [autoBlock, setAutoBlock] = useState(true);
    const [cloudSync, setCloudSync] = useState(false);

    return (
        <main className="flex-1 mt-24 px-8 pb-12 max-w-[1440px] mx-auto w-full">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white">System Configuration</h2>
                    <p className="text-sm text-slate-400 mt-1">Manage global swarm operating parameters and security tolerances.</p>
                </div>
                <button className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-sm transition-all focus:ring focus:ring-primary/50">
                    Discard Changes
                </button>
                <button className="ml-3 px-6 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm shadow-[0_0_15px_rgba(37,106,244,0.3)] transition-all">
                    Apply Configuration
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column Settings */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="glass-card rounded-3xl p-8 border border-white/10">
                        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">security</span>
                            Global Security Thresholds
                        </h3>

                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-[15px] font-bold text-white">Advanced Heuristics Engine</h4>
                                    <p className="text-xs text-slate-400 mt-1">Enable deep-learning pattern recognition for zero-day threats.</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={heuristics} onChange={(e) => setHeuristics(e.target.checked)} />
                                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary border border-white/5"></div>
                                </label>
                            </div>

                            <div className="h-px bg-white/5 w-full"></div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-[15px] font-bold text-white">Autonomous Threat Isolation</h4>
                                    <p className="text-xs text-slate-400 mt-1">Automatically disconnect infected nodes without operator approval.</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={autoBlock} onChange={(e) => setAutoBlock(e.target.checked)} />
                                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-danger border border-white/5"></div>
                                </label>
                            </div>

                            <div className="h-px bg-white/5 w-full"></div>

                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h4 className="text-[15px] font-bold text-white">Agent Autonomy Level</h4>
                                        <p className="text-xs text-slate-400 mt-1">Define the independent decision making bounds for deployed swarm agents.</p>
                                    </div>
                                    <span className="px-3 py-1 bg-white/5 rounded-lg text-primary font-bold text-sm border border-white/10 shadow-inner">
                                        Level {autonomyLevel}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="1"
                                    max="5"
                                    value={autonomyLevel}
                                    onChange={(e) => setAutonomyLevel(e.target.value)}
                                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                                />
                                <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 mt-2">
                                    <span>Manual</span>
                                    <span>Supervised</span>
                                    <span>Full Autonomy</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card rounded-3xl p-8 border border-white/10 flex items-center justify-between opacity-80 hover:opacity-100 transition-opacity cursor-pointer block">
                        <div className="flex items-center gap-4">
                            <div className="size-12 rounded-xl bg-white/5 flex items-center justify-center">
                                <span className="material-symbols-outlined text-slate-300">vpn_key</span>
                            </div>
                            <div>
                                <h4 className="text-[15px] font-bold text-white">API Keys & Authentication</h4>
                                <p className="text-xs text-slate-400 mt-0.5">Manage external integrations and WebHook access.</p>
                            </div>
                        </div>
                        <span className="material-symbols-outlined text-slate-500">chevron_right</span>
                    </div>
                </div>

                {/* Right Column Specs */}
                <div className="space-y-6">
                    <div className="glass-panel p-6 rounded-3xl border border-white/10">
                        <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-4">Node Preferences</h3>
                        <div className="space-y-4">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Default Region</label>
                                <select className="bg-white/5 border border-white/10 text-white rounded-xl focus:ring focus:ring-primary/50 block w-full p-2.5 text-sm transition-all outline-none">
                                    <option>US East (N. Virginia)</option>
                                    <option>EU Central (Frankfurt)</option>
                                    <option>AP Southeast (Singapore)</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Log Retention policy</label>
                                <select className="bg-white/5 border border-white/10 text-white rounded-xl focus:ring focus:ring-primary/50 block w-full p-2.5 text-sm transition-all outline-none">
                                    <option>30 Days</option>
                                    <option>90 Days</option>
                                    <option>1 Year</option>
                                    <option>Indefinite (S3 Archive)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card p-6 rounded-3xl border border-primary/20 overflow-hidden relative group">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-50 group-hover:opacity-100 transition-opacity"></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-4">
                                <span className="material-symbols-outlined text-primary text-2xl animate-pulse">cloud_sync</span>
                                <h4 className="text-sm font-bold text-white tracking-wide">Cloud Intelligence Sync</h4>
                            </div>
                            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                                Periodically fetch verified threat signatures from the global Kinetix-Zero network.
                            </p>
                            <button
                                className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${cloudSync ? 'bg-primary/20 text-primary border border-primary/50 shadow-[0_0_15px_rgba(37,106,244,0.3)]' : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'}`}
                                onClick={() => setCloudSync(!cloudSync)}
                            >
                                {cloudSync ? 'Syncing Active' : 'Enable Cloud Sync'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
