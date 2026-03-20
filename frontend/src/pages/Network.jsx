import React from 'react';

export default function Network() {
    return (
        <main className="flex-1 pt-24 pb-8 px-6 lg:px-12 max-w-[1440px] mx-auto w-full flex gap-6 relative overflow-hidden">
            {/* Center/Left Content Placeholder */}
            <div className="flex-1 flex flex-col gap-6">
                {/* Main Content Area (Previously empty main) */}
            </div>
            {/* Right Side: Network Entries Panel */}
            <aside className="w-full max-w-[380px] h-[calc(100vh-140px)] glass-panel rounded-3xl flex flex-col overflow-hidden border border-white/10 shadow-2xl relative">
                <div className="p-6 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#080a12]/80 backdrop-blur-xl z-10">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-xl">lan</span>
                        <h2 className="text-sm font-bold uppercase tracking-widest text-white/90">Network Infrastructure</h2>
                    </div>
                    <div className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary uppercase">Live Monitoring</div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">

                    {/* Entry 1: CORE-ADMIN */}
                    <div className="glass-card p-5 rounded-2xl border border-white/10 hover:border-primary/40 transition-all group relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-sm font-bold text-white group-hover:text-primary transition-colors">CORE-ADMIN</h3>
                                    <p className="text-[11px] text-slate-500 font-mono">10.0.0.1/24</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-medium text-slate-400">24/20 Online</span>
                                    <div className="px-2 py-1 rounded bg-red-500/20 border border-red-500/30 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[12px] text-red-500 fill-1">error</span>
                                        <span className="text-[10px] font-bold text-red-400">3</span>
                                    </div>
                                </div>
                            </div>
                            {/* Device Breakdown */}
                            <div className="grid grid-cols-5 gap-2">
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">dns</span>
                                    <span className="text-[10px] font-bold text-white">8</span>
                                    <span className="text-[8px] uppercase text-slate-500">Srv</span>
                                </div>
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">router</span>
                                    <span className="text-[10px] font-bold text-white">2</span>
                                    <span className="text-[8px] uppercase text-slate-500">Rtr</span>
                                </div>
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">settings_input_component</span>
                                    <span className="text-[10px] font-bold text-white">4</span>
                                    <span className="text-[8px] uppercase text-slate-500">Swt</span>
                                </div>
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">desktop_windows</span>
                                    <span className="text-[10px] font-bold text-white">10</span>
                                    <span className="text-[8px] uppercase text-slate-500">PC</span>
                                </div>
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">domain_verification</span>
                                    <span className="text-[10px] font-bold text-white">0</span>
                                    <span className="text-[8px] uppercase text-slate-500">Fw</span>
                                </div>
                            </div>
                            <button className="mt-4 w-full py-2 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-slate-300 uppercase tracking-wider hover:bg-primary/20 hover:border-primary/40 hover:text-white transition-all backdrop-blur-sm neo-glow flex items-center justify-center gap-2 group/btn">
                                View Full Segment Details
                                <span className="material-symbols-outlined text-[14px] group-hover/btn:translate-x-0.5 transition-transform">arrow_forward</span>
                            </button>
                        </div>
                    </div>

                    {/* Entry 2: SEC-VLAN-01 */}
                    <div className="glass-card p-5 rounded-2xl border border-white/10 hover:border-accent-purple/40 transition-all group relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-accent-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-sm font-bold text-white group-hover:text-accent-purple transition-colors">SEC-VLAN-01</h3>
                                    <p className="text-[11px] text-slate-500 font-mono">192.168.50.0/24</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-medium text-slate-400">12/12 Online</span>
                                    <div className="px-2 py-1 rounded bg-green-500/20 border border-green-500/30 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[12px] text-green-500">check_circle</span>
                                        <span className="text-[10px] font-bold text-green-400">0</span>
                                    </div>
                                </div>
                            </div>
                            {/* Device Breakdown */}
                            <div className="grid grid-cols-5 gap-2">
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">dns</span>
                                    <span className="text-[10px] font-bold text-white">2</span>
                                    <span className="text-[8px] uppercase text-slate-500">Srv</span>
                                </div>
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">router</span>
                                    <span className="text-[10px] font-bold text-white">1</span>
                                    <span className="text-[8px] uppercase text-slate-500">Rtr</span>
                                </div>
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">settings_input_component</span>
                                    <span className="text-[10px] font-bold text-white">1</span>
                                    <span className="text-[8px] uppercase text-slate-500">Swt</span>
                                </div>
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">desktop_windows</span>
                                    <span className="text-[10px] font-bold text-white">7</span>
                                    <span className="text-[8px] uppercase text-slate-500">PC</span>
                                </div>
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">security</span>
                                    <span className="text-[10px] font-bold text-white">1</span>
                                    <span className="text-[8px] uppercase text-slate-500">Fw</span>
                                </div>
                            </div>
                            <button className="mt-4 w-full py-2 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-slate-300 uppercase tracking-wider hover:bg-accent-purple/20 hover:border-accent-purple/40 hover:text-white transition-all backdrop-blur-sm neo-glow flex items-center justify-center gap-2 group/btn">
                                View Full Segment Details
                                <span className="material-symbols-outlined text-[14px] group-hover/btn:translate-x-0.5 transition-transform">arrow_forward</span>
                            </button>
                        </div>
                    </div>

                    {/* Entry 3: IOT-MESH-NODE */}
                    <div className="glass-card p-5 rounded-2xl border border-white/10 hover:border-primary/40 transition-all group relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-sm font-bold text-white group-hover:text-primary transition-colors">IOT-MESH-NODE</h3>
                                    <p className="text-[11px] text-slate-500 font-mono">10.10.20.0/22</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-medium text-slate-400">142/138 Online</span>
                                    <div className="px-2 py-1 rounded bg-orange-500/20 border border-orange-500/30 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[12px] text-orange-500">warning</span>
                                        <span className="text-[10px] font-bold text-orange-400">14</span>
                                    </div>
                                </div>
                            </div>
                            {/* Device Breakdown */}
                            <div className="grid grid-cols-5 gap-2">
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">dns</span>
                                    <span className="text-[10px] font-bold text-white">4</span>
                                    <span className="text-[8px] uppercase text-slate-500">Srv</span>
                                </div>
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">router</span>
                                    <span className="text-[10px] font-bold text-white">12</span>
                                    <span className="text-[8px] uppercase text-slate-500">Rtr</span>
                                </div>
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">settings_input_component</span>
                                    <span className="text-[10px] font-bold text-white">32</span>
                                    <span className="text-[8px] uppercase text-slate-500">Swt</span>
                                </div>
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">sensors</span>
                                    <span className="text-[10px] font-bold text-white">94</span>
                                    <span className="text-[8px] uppercase text-slate-500">PC</span>
                                </div>
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">security</span>
                                    <span className="text-[10px] font-bold text-white">0</span>
                                    <span className="text-[8px] uppercase text-slate-500">Fw</span>
                                </div>
                            </div>
                            <button className="mt-4 w-full py-2 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-slate-300 uppercase tracking-wider hover:bg-primary/20 hover:border-primary/40 hover:text-white transition-all backdrop-blur-sm neo-glow flex items-center justify-center gap-2 group/btn">
                                View Full Segment Details
                                <span className="material-symbols-outlined text-[14px] group-hover/btn:translate-x-0.5 transition-transform">arrow_forward</span>
                            </button>
                        </div>
                    </div>

                    {/* Entry 4: CLOUD-RELAY-04 */}
                    <div className="glass-card p-5 rounded-2xl border border-white/10 hover:border-primary/40 transition-all group relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-sm font-bold text-white group-hover:text-primary transition-colors">CLOUD-RELAY-04</h3>
                                    <p className="text-[11px] text-slate-500 font-mono">45.2.112.5/29</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-medium text-slate-400">5/5 Online</span>
                                    <div className="px-2 py-1 rounded bg-green-500/20 border border-green-500/30 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[12px] text-green-500">check_circle</span>
                                        <span className="text-[10px] font-bold text-green-400">0</span>
                                    </div>
                                </div>
                            </div>
                            {/* Device Breakdown */}
                            <div className="grid grid-cols-5 gap-2">
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">dns</span>
                                    <span className="text-[10px] font-bold text-white">5</span>
                                    <span className="text-[8px] uppercase text-slate-500">Srv</span>
                                </div>
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5 opacity-40">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">router</span>
                                    <span className="text-[10px] font-bold text-white">0</span>
                                    <span className="text-[8px] uppercase text-slate-500">Rtr</span>
                                </div>
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5 opacity-40">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">settings_input_component</span>
                                    <span className="text-[10px] font-bold text-white">0</span>
                                    <span className="text-[8px] uppercase text-slate-500">Swt</span>
                                </div>
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5 opacity-40">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">desktop_windows</span>
                                    <span className="text-[10px] font-bold text-white">0</span>
                                    <span className="text-[8px] uppercase text-slate-500">PC</span>
                                </div>
                                <div className="flex flex-col items-center p-2 rounded-lg bg-white/5 border border-white/5 opacity-40">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400 mb-1">security</span>
                                    <span className="text-[10px] font-bold text-white">0</span>
                                    <span className="text-[8px] uppercase text-slate-500">Fw</span>
                                </div>
                            </div>
                            <button className="mt-4 w-full py-2 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-slate-300 uppercase tracking-wider hover:bg-primary/20 hover:border-primary/40 hover:text-white transition-all backdrop-blur-sm neo-glow flex items-center justify-center gap-2 group/btn">
                                View Full Segment Details
                                <span className="material-symbols-outlined text-[14px] group-hover/btn:translate-x-0.5 transition-transform">arrow_forward</span>
                            </button>
                        </div>
                    </div>

                </div>

                {/* Footer Action */}
                <div className="p-4 border-t border-white/5 bg-[#080a12]/50">
                    <button className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-[13px] font-bold text-white shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        Register New Segment
                    </button>
                </div>
            </aside>
        </main>
    );
}
