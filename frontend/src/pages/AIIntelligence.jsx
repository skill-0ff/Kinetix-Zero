import React from 'react';

export default function AIIntelligence() {
    return (
        <main className="flex-1 mt-24 px-8 pb-12 max-w-[1440px] mx-auto w-full">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-accent-purple to-pink-500">
                        Neural Core AI
                    </h2>
                    <p className="text-sm text-slate-400 mt-1">Supervising autonomous threat heuristics & deep learning models.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Core Visualizer */}
                <div className="lg:col-span-2 glass-card rounded-3xl p-8 border border-accent-purple/30 shadow-[0_0_30px_rgba(168,85,247,0.15)] relative overflow-hidden flex flex-col items-center justify-center min-h-[400px]">
                    <div className="absolute inset-0 bg-gradient-to-br from-accent-purple/5 to-transparent"></div>

                    <div className="relative size-64 flex items-center justify-center mb-8">
                        <div className="absolute inset-0 border-2 border-accent-purple/20 rounded-full animate-[spin_10s_linear_infinite]"></div>
                        <div className="absolute inset-4 border-2 border-dashed border-primary/40 rounded-full animate-[spin_15s_linear_infinite_reverse]"></div>
                        <div className="absolute inset-8 border border-pink-500/20 rounded-full animate-pulse"></div>

                        <div className="size-24 rounded-full bg-gradient-to-br from-accent-purple to-pink-600 shadow-[0_0_50px_rgba(168,85,247,0.8)] flex items-center justify-center z-10 animate-pulse">
                            <span className="material-symbols-outlined text-white text-4xl">auto_awesome</span>
                        </div>
                    </div>

                    <div className="w-full max-w-md">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Global Training: Epoch 48/100</span>
                            <span className="text-lg font-bold text-accent-purple">74.2%</span>
                        </div>
                        <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden p-[2px]">
                            <div className="h-full w-[74.2%] bg-gradient-to-r from-primary via-accent-purple to-pink-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                        </div>
                        <p className="text-center text-[10px] text-slate-500 uppercase mt-4 font-mono">Status: Processing 1.2M logs/sec</p>
                    </div>
                </div>

                {/* AI Stats */}
                <div className="flex flex-col gap-6">
                    <div className="glass-card rounded-2xl p-6 border border-white/5 flex-1 flex flex-col justify-center">
                        <span className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2 block">Model Accuracy</span>
                        <div className="text-4xl font-bold text-white flex items-baseline gap-2">
                            99.84%
                            <span className="text-[10px] text-green-500 font-bold flex items-center"><span className="material-symbols-outlined text-[12px]">arrow_upward</span> 0.02%</span>
                        </div>
                    </div>
                    <div className="glass-card rounded-2xl p-6 border border-white/5 flex-1 flex flex-col justify-center">
                        <span className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2 block">False Positive Rate</span>
                        <div className="text-4xl font-bold text-white flex items-baseline gap-2">
                            0.12%
                            <span className="text-[10px] text-green-500 font-bold flex items-center"><span className="material-symbols-outlined text-[12px]">arrow_downward</span> 0.05%</span>
                        </div>
                    </div>
                    <div className="glass-card rounded-2xl p-6 border border-white/5 flex-1 flex flex-col justify-center">
                        <span className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2 block">Inference Speed</span>
                        <div className="text-4xl font-bold text-white flex items-baseline gap-2">
                            12ms
                            <span className="text-[10px] text-slate-500 font-bold flex items-center"> avg per event</span>
                        </div>
                    </div>
                </div>
            </div>

        </main>
    );
}
