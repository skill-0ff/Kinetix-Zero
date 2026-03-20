```javascript
import React, { useState } from 'react';
import './Configuration.css';

export default function Configuration() {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
        <main className="flex-1 pt-28 pb-12 px-8 max-w-[1440px] mx-auto w-full">
            <div className="flex items-end justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">System Configuration</h2>
                    <p className="text-slate-400 text-sm">Fine-tune the security engine and network protocols.</p>
                </div>
                <div className="flex gap-4">
          <button
            className={`flex items - center gap - 2 px - 6 py - 2.5 rounded - xl border transition - all text - sm font - medium group ${ showAdvanced ? 'bg-primary/20 text-primary border-primary/30' : 'border-white/10 text-slate-300 hover:bg-white/5' } `}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span className={`material - symbols - outlined text - [18px] transition - transform ${ showAdvanced ? 'rotate-90' : 'group-hover:rotate-45' } `}>settings</span>
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
                <div className="glass-card rounded-2xl p-6 flex flex-col gap-6 neon-border-blue">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary neon-text-blue">notification_important</span>
                        <h3 className="text-lg font-semibold text-white">Alert Management</h3>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">New Alerts</span>
                            <button className="w-10 h-5 bg-primary rounded-full relative transition-all shadow-[0_0_10px_rgba(37,106,244,0.5)]">
                                <span className="absolute right-1 top-1 size-3 bg-white rounded-full"></span>
                            </button>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Known Alerts</span>
                            <button className="w-10 h-5 bg-white/10 rounded-full relative transition-all">
                                <span className="absolute left-1 top-1 size-3 bg-slate-400 rounded-full"></span>
                            </button>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">FP Alerts</span>
                            <button className="w-10 h-5 bg-primary rounded-full relative transition-all shadow-[0_0_10px_rgba(37,106,244,0.5)]">
                                <span className="absolute right-1 top-1 size-3 bg-white rounded-full"></span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* 2. Role Management */}
                <div className="glass-card rounded-2xl p-6 flex flex-col gap-4 lg:row-span-2 neon-border-purple">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-accent-purple">shield_person</span>
                            <h3 className="text-lg font-semibold text-white">Role Management</h3>
                        </div>
                        <button className="size-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors border border-white/10">
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
                <div className="glass-card rounded-2xl p-6 flex flex-col gap-6 neon-border-blue">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-blue-400">database</span>
                        <h3 className="text-lg font-semibold text-white">Log Storage</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                            <span className="text-xs text-slate-400">Safe</span>
                            <button className="w-8 h-4 bg-primary rounded-full relative shadow-[0_0_8px_rgba(37,106,244,0.4)]">
                                <span className="absolute right-0.5 top-0.5 size-3 bg-white rounded-full"></span>
                            </button>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                            <span className="text-xs text-slate-400">New</span>
                            <button className="w-8 h-4 bg-primary rounded-full relative shadow-[0_0_8px_rgba(37,106,244,0.4)]">
                                <span className="absolute right-0.5 top-0.5 size-3 bg-white rounded-full"></span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* 4. Checkpointing */}
                <div className="glass-card rounded-2xl p-6 flex flex-col gap-6 neon-border-amber">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-orange-400">save</span>
                        <h3 className="text-lg font-semibold text-white">Checkpointing</h3>
                    </div>
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-sm text-slate-300">Auto-save frequency</label>
                                <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 shadow-[0_0_10px_rgba(37,106,244,0.2)]">
                                    3600s
                                </span>
                            </div>
                            <input className="w-full" max="7200" min="60" type="range" defaultValue="3600" />
                        </div>
                    </div>
                </div>

                {/* 5. Memory (Qdrant) */}
                <div className="glass-card rounded-2xl p-6 flex flex-col gap-6 neon-border-rose">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-pink-400">memory</span>
                        <h3 className="text-lg font-semibold text-white">Memory (Qdrant)</h3>
                    </div>
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-sm text-slate-300">Dedup Distance</label>
                                <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 shadow-[0_0_10px_rgba(37,106,244,0.2)]">
                                    0.05
                                </span>
                            </div>
                            <input className="w-full" max="1.0" min="0" step="0.01" type="range" defaultValue="0.05" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Detailed Advanced Configuration Panels */}
      {showAdvanced && (
      <div className="space-y-10">
        <div className="flex items-center gap-6">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>
                    <span className="text-sm font-bold uppercase tracking-[0.3em] text-primary drop-shadow-[0_0_12px_rgba(37,106,244,0.8)]">
                        Detailed Advanced Settings
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {/* Network */}
                    <div className="glass-card rounded-[2rem] p-8 neon-border-blue relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 size-32 bg-primary/20 blur-3xl rounded-full"></div>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="size-10 rounded-xl bg-cyan-400/10 flex items-center justify-center text-cyan-400 border border-cyan-400/30 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                                <span className="material-symbols-outlined text-[22px]">lan</span>
                            </div>
                            <h3 className="text-lg font-bold text-white tracking-tight">Network</h3>
                        </div>
                        <div className="space-y-5">
                            <div className="relative">
                                <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Service Port</label>
                                <div className="relative flex items-center stepper-container">
                                    <input className="w-full input-glass !pr-12" id="port-input" placeholder="Enter port..." type="number" defaultValue="5001" />
                                    <div className="absolute right-2 flex flex-col gap-0.5 opacity-60">
                                        <span className="material-symbols-outlined text-[14px] stepper-btn font-bold">add</span>
                                        <span className="material-symbols-outlined text-[14px] stepper-btn font-bold">remove</span>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Transmission Protocol</label>
                                <div className="flex p-1 bg-white/5 rounded-2xl border border-white/10">
                                    <button className="flex-1 py-2 text-xs font-bold rounded-xl bg-primary text-white shadow-[0_0_15px_rgba(37,106,244,0.5)]">UDP</button>
                                    <button className="flex-1 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors">TCP</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Brain Logic */}
                    <div className="glass-card rounded-[2rem] p-8 neon-border-rose relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 size-32 bg-rose-400/20 blur-3xl rounded-full"></div>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="size-10 rounded-xl bg-rose-400/10 flex items-center justify-center text-rose-400 border border-rose-400/30 shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                                <span className="material-symbols-outlined text-[22px]">psychology</span>
                            </div>
                            <h3 className="text-lg font-bold text-white tracking-tight">Brain Logic</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-1">
                                <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Time Win</label>
                                <div className="relative flex items-center stepper-container">
                                    <input className="w-full input-glass !pr-8" id="timewin-input" placeholder="0.0" step="0.1" type="number" defaultValue="5.0" />
                                    <div className="absolute right-2 flex flex-col opacity-60">
                                        <span className="material-symbols-outlined text-[12px] stepper-btn">keyboard_arrow_up</span>
                                        <span className="material-symbols-outlined text-[12px] stepper-btn">keyboard_arrow_down</span>
                                    </div>
                                </div>
                            </div>
                            <div className="col-span-1">
                                <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Max Seq</label>
                                <div className="relative flex items-center stepper-container">
                                    <input className="w-full input-glass !pr-8" id="maxseq-input" placeholder="0" type="number" defaultValue="100" />
                                    <div className="absolute right-2 flex flex-col opacity-60">
                                        <span className="material-symbols-outlined text-[12px] stepper-btn">keyboard_arrow_up</span>
                                        <span className="material-symbols-outlined text-[12px] stepper-btn">keyboard_arrow_down</span>
                                    </div>
                                </div>
                            </div>
                            <div className="col-span-1">
                                <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">DDoS Thr</label>
                                <div className="relative flex items-center stepper-container">
                                    <input className="w-full input-glass !pr-8" id="ddos-input" placeholder="0" type="number" defaultValue="50" />
                                    <div className="absolute right-2 flex flex-col opacity-60">
                                        <span className="material-symbols-outlined text-[12px] stepper-btn">keyboard_arrow_up</span>
                                        <span className="material-symbols-outlined text-[12px] stepper-btn">keyboard_arrow_down</span>
                                    </div>
                                </div>
                            </div>
                            <div className="col-span-1">
                                <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Queue Size</label>
                                <div className="relative flex items-center stepper-container">
                                    <input className="w-full input-glass !pr-8" id="queue-input" placeholder="0" type="number" defaultValue="10000" />
                                    <div className="absolute right-2 flex flex-col opacity-60">
                                        <span className="material-symbols-outlined text-[12px] stepper-btn">keyboard_arrow_up</span>
                                        <span className="material-symbols-outlined text-[12px] stepper-btn">keyboard_arrow_down</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* AI Engine */}
                    <div className="glass-card rounded-[2rem] p-8 neon-border-emerald relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 size-32 bg-emerald-400/20 blur-3xl rounded-full"></div>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="size-10 rounded-xl bg-emerald-400/10 flex items-center justify-center text-emerald-400 border border-emerald-400/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                                <span className="material-symbols-outlined text-[22px]">neurology</span>
                            </div>
                            <h3 className="text-lg font-bold text-white tracking-tight">AI Engine</h3>
                        </div>
                        <div className="space-y-5">
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Context Epochs</label>
                                <input className="w-full input-glass" placeholder="Value..." type="number" defaultValue="5" />
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider !mb-0">Anomaly Sensitivity</label>
                                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/30 shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                                        0.90
                                    </span>
                                </div>
                                <input className="w-full" max="1" min="0" step="0.01" type="range" defaultValue="0.9" />
                            </div>
                        </div>
                    </div>

                    {/* Database */}
                    <div className="glass-card rounded-[2rem] p-8 neon-border-purple relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 size-32 bg-purple-400/20 blur-3xl rounded-full"></div>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="size-10 rounded-xl bg-indigo-400/10 flex items-center justify-center text-indigo-400 border border-indigo-400/30 shadow-[0_0_15px_rgba(129,140,248,0.2)]">
                                <span className="material-symbols-outlined text-[22px]">storage</span>
                            </div>
                            <h3 className="text-lg font-bold text-white tracking-tight">Database</h3>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Vector Path</label>
                                <input className="w-full input-glass font-mono text-xs" placeholder="/path/to/db" type="text" defaultValue="DB/vector" />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Remote URL</label>
                                <input className="w-full input-glass font-mono text-xs" placeholder="None specified" type="text" />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Mongo URI</label>
                                <input className="w-full input-glass font-mono text-xs" placeholder="mongodb://..." type="text" defaultValue="mongodb://localhost:27017/" />
                            </div>
                        </div>
                    </div>

                    {/* Memory */}
                    <div className="glass-card rounded-[2rem] p-8 neon-border-rose relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 size-32 bg-pink-400/20 blur-3xl rounded-full"></div>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="size-10 rounded-xl bg-pink-400/10 flex items-center justify-center text-pink-400 border border-pink-400/30 shadow-[0_0_15px_rgba(244,114,182,0.2)]">
                                <span className="material-symbols-outlined text-[22px]">data_array</span>
                            </div>
                            <h3 className="text-lg font-bold text-white tracking-tight">Memory</h3>
                        </div>
                        <div className="space-y-5">
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Dedup Distance</label>
                                <div className="relative flex items-center stepper-container">
                                    <input className="w-full input-glass !pr-10" id="mem-dedup-input" placeholder="0.00" step="0.01" type="number" defaultValue="0.05" />
                                    <div className="absolute right-2 flex items-center gap-1 opacity-60">
                                        <span className="material-symbols-outlined text-[16px] stepper-btn">remove</span>
                                        <span className="material-symbols-outlined text-[16px] stepper-btn">add</span>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Query Distance</label>
                                <input className="w-full input-glass" placeholder="0.00" step="0.01" type="number" defaultValue="0.10" />
                            </div>
                        </div>
                    </div>

                    {/* Persistence */}
                    <div className="glass-card rounded-[2rem] p-8 neon-border-amber relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 size-32 bg-orange-400/20 blur-3xl rounded-full"></div>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="size-10 rounded-xl bg-orange-400/10 flex items-center justify-center text-orange-400 border border-orange-400/30 shadow-[0_0_15px_rgba(251,146,60,0.2)]">
                                <span className="material-symbols-outlined text-[22px]">restore</span>
                            </div>
                            <h3 className="text-lg font-bold text-white tracking-tight">Persistence</h3>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Checkpoint File</label>
                                <input className="w-full input-glass" placeholder="filename..." type="text" defaultValue="auto" />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Interval (sec)</label>
                                <input className="w-full input-glass" placeholder="3600" type="number" defaultValue="3600" />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">History Count</label>
                                <input className="w-full input-glass" placeholder="10" type="number" defaultValue="10" />
                            </div>
                        </div>
                    </div>

                    {/* Forensics */}
                    <div className="glass-card rounded-[2rem] p-8 neon-border-amber relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 size-32 bg-amber-400/20 blur-3xl rounded-full"></div>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="size-10 rounded-xl bg-amber-400/10 flex items-center justify-center text-amber-400 border border-amber-400/30 shadow-[0_0_15px_rgba(251,191,36,0.2)]">
                                <span className="material-symbols-outlined text-[22px]">fingerprint</span>
                            </div>
                            <h3 className="text-lg font-bold text-white tracking-tight">Forensics</h3>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider !mb-0">Sample Rate</label>
                                    <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/30 shadow-[0_0_10px_rgba(251,191,36,0.3)]">
                                        100%
                                    </span>
                                </div>
                                <input className="w-full" max="100" min="0" type="range" defaultValue="100" />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Extraction Mode</label>
                                <select className="w-full input-glass appearance-none bg-no-repeat bg-[right_1rem_center] bg-[length:1em_1em]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='rgba(37,106,244,0.6)'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")" }}>
                                    <option defaultValue="Randomized">Randomized</option>
                                    <option>Sequential</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* MISP Integration */}
                    <div className="glass-card rounded-[2rem] p-8 neon-border-rose relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 size-32 bg-red-400/20 blur-3xl rounded-full"></div>
                        <div className="flex items-center gap-4 mb-8">
                            <div className="size-10 rounded-xl bg-red-400/10 flex items-center justify-center text-red-400 border border-red-400/30 shadow-[0_0_15px_rgba(248,113,113,0.2)]">
                                <span className="material-symbols-outlined text-[22px]">share_reviews</span>
                            </div>
                            <h3 className="text-lg font-bold text-white tracking-tight">MISP</h3>
                        </div>
                        <div className="space-y-5">
                            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Status</label>
                                <button className="w-10 h-5 bg-white/10 rounded-full relative transition-all">
                                    <span className="absolute left-1 top-1 size-3 bg-slate-500 rounded-full"></span>
                                </button>
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-slate-400 mb-2 block uppercase tracking-wider">Endpoint URL</label>
                                <input className="w-full input-glass text-xs" placeholder="https://..." type="text" defaultValue="https://misp.local" />
                            </div>
                            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">SSL Verify</label>
                                <button className="w-10 h-5 bg-primary rounded-full relative transition-all shadow-[0_0_10px_rgba(37,106,244,0.4)]">
                                    <span className="absolute right-1 top-1 size-3 bg-white rounded-full"></span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
      </div>
      )}

      {/* Footer Quick Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                    <div className="glass-card rounded-2xl p-6 neon-border-amber flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-amber-400 text-xl">key</span>
                            <h3 className="text-sm font-semibold text-white">API Key</h3>
                        </div>
                        <div className="relative">
                            <input className="w-full input-glass !py-2.5 !px-4 !text-xs" readOnly type="password" defaultValue="••••••••••••••••" />
                            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                                <span className="material-symbols-outlined text-[18px]">visibility</span>
                            </button>
                        </div>
                    </div>

                    <div className="glass-card rounded-2xl p-6 neon-border-blue flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-blue-400 text-xl">monitor_heart</span>
                            <h3 className="text-sm font-semibold text-white">Heartbeat</h3>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-mono text-primary neon-text-blue">30000ms</span>
                            </div>
                            <input className="w-full" max="60000" min="5000" step="1000" type="range" defaultValue="30000" />
                        </div>
                    </div>

                    <div className="glass-card rounded-2xl p-6 neon-border-purple flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-purple-400 text-xl">enhanced_encryption</span>
                            <h3 className="text-sm font-semibold text-white">Encryption</h3>
                        </div>
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-purple-400/30 shadow-[0_0_10px_rgba(168,85,247,0.1)]">
                            <span className="text-xs text-slate-300 font-mono">AES-256-GCM</span>
                            <button className="w-8 h-4 bg-primary rounded-full relative transition-all shadow-[0_0_10px_rgba(37,106,244,0.4)]">
                                <span className="absolute right-0.5 top-0.5 size-3 bg-white rounded-full"></span>
                            </button>
                        </div>
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
