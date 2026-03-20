import React from 'react';

export default function Agent() {
    return (
        <main className="flex-1 mt-24 px-8 pb-12 max-w-[1440px] mx-auto w-full">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">Agent Swarm Management</h2>
                    <p className="text-sm text-slate-400 mt-1">Configure and deploy autonomous threat-hunting nodes.</p>
                </div>
                <button className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm shadow-[0_0_15px_rgba(37,106,244,0.4)] transition-all flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                    Deploy New Swarm
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="glass-card rounded-2xl p-6 border border-primary/20 hover:border-primary/50 transition-colors relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 size-24 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all"></div>
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-400 text-sm font-medium">Active Agents</span>
                        <span className="material-symbols-outlined text-primary">memory</span>
                    </div>
                    <div className="text-4xl font-bold text-white">4,092</div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-primary font-bold">
                        <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>
                        SYNCED
                    </div>
                </div>
                <div className="glass-card rounded-2xl p-6 border border-white/5 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-400 text-sm font-medium">Compute Allocation</span>
                        <span className="material-symbols-outlined text-slate-500">developer_board</span>
                    </div>
                    <div className="text-4xl font-bold text-white">86%</div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full mt-3 overflow-hidden">
                        <div className="h-full w-[86%] bg-blue-400 rounded-full"></div>
                    </div>
                </div>
                <div className="glass-card rounded-2xl p-6 border border-white/5 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-400 text-sm font-medium">Threats Neutralized</span>
                        <span className="material-symbols-outlined text-green-500">shield</span>
                    </div>
                    <div className="text-4xl font-bold text-white">12.4k</div>
                    <div className="mt-2 text-xs text-slate-500 font-medium">+340 this hour</div>
                </div>
                <div className="glass-card rounded-2xl p-6 border border-white/5 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-400 text-sm font-medium">Node Casualties</span>
                        <span className="material-symbols-outlined text-red-500">warning</span>
                    </div>
                    <div className="text-4xl font-bold text-white">14</div>
                    <div className="mt-2 text-xs text-red-500 font-medium">Awaiting regeneration</div>
                </div>
            </div>

            <div className="glass-card rounded-3xl p-8 border border-white/10 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                    <span className="material-symbols-outlined text-9xl text-white">hive</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-6">Recent Swarm Directives</h3>
                <div className="space-y-4 relative z-10">
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between hover:bg-white/10 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                                <span className="material-symbols-outlined">search</span>
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-white">Deep Scan: Subnet Gamma</h4>
                                <p className="text-xs text-slate-400">Deployed 240 agents • 15 mins ago</p>
                            </div>
                        </div>
                        <div className="px-3 py-1 bg-primary/20 text-primary border border-primary/20 rounded text-[10px] font-bold uppercase">In Progress</div>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between hover:bg-white/10 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-lg bg-red-500/20 flex items-center justify-center text-red-500">
                                <span className="material-symbols-outlined">block</span>
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-white">Isolate Compromised Sector</h4>
                                <p className="text-xs text-slate-400">Deployed 800 agents • 1 hr ago</p>
                            </div>
                        </div>
                        <div className="px-3 py-1 bg-green-500/20 text-green-500 border border-green-500/20 rounded text-[10px] font-bold uppercase">Completed</div>
                    </div>
                </div>
            </div>
        </main>
    );
}
