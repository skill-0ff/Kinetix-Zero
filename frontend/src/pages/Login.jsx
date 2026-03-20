import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
    const navigate = useNavigate();

    return (
        <main className="flex-1 min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
            {/* Background blobs for depth */}
            <div className="absolute top-1/3 left-1/4 size-[500px] bg-primary/20 rounded-full blur-[120px] mix-blend-screen animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 size-[600px] bg-accent-purple/10 rounded-full blur-[150px] mix-blend-screen"></div>

            <div className="glass-card rounded-2xl p-10 w-full max-w-[420px] relative z-10 border border-white/10 shadow-2xl overflow-hidden group">
                <div className="absolute -right-4 -top-4 size-32 bg-primary/20 rounded-full blur-3xl transition-all glow-layer"></div>
                <div className="absolute -left-4 -bottom-4 size-32 bg-accent-purple/20 rounded-full blur-3xl transition-all glow-layer"></div>

                <div className="relative z-10 flex flex-col items-center mb-8">
                    <div className="size-14 bg-gradient-to-br from-primary to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/30 mb-5 relative group-hover:scale-105 transition-transform duration-500">
                        <span className="material-symbols-outlined text-white text-3xl">deployed_code</span>
                        <div className="absolute inset-0 bg-white/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                        Kinetix-Zero Access
                    </h2>
                    <p className="text-slate-400 text-[13px] mt-2 tracking-wide">Authenticate to enter the neural core</p>
                </div>

                <form className="relative z-10 space-y-5" onSubmit={async (e) => {
                    e.preventDefault();
                    const username = e.target[0].value;
                    const password = e.target[1].value;

                    try {
                        const response = await fetch('http://localhost:8000/api/v1/auth/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ username, password })
                        });

                        if (response.ok) {
                            const { access_token } = await response.json();
                            localStorage.setItem('token', access_token);
                            navigate('/');
                        } else {
                            alert('Invalid Operator Credentials');
                        }
                    } catch (err) {
                        console.error('Login Failed:', err);
                        alert('Neural Core Connection Failed');
                    }
                }}>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Operator ID</label>
                        <div className="relative group">
                            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-[20px] group-focus-within:text-primary transition-colors">person</span>
                            <input type="text" className="w-full bg-black/20 border border-white/5 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all font-mono text-sm placeholder:text-slate-600 shadow-inner" placeholder="OP-7749" defaultValue="admin" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Access Key</label>
                        <div className="relative group">
                            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-[20px] group-focus-within:text-primary transition-colors">key</span>
                            <input type="password" className="w-full bg-black/20 border border-white/5 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all font-mono text-sm placeholder:text-slate-600 shadow-inner" placeholder="••••••••" defaultValue="password" />
                        </div>
                    </div>

                    <div className="pt-2">
                        <button type="submit" className="relative w-full py-3.5 bg-gradient-to-r from-primary to-blue-600 rounded-xl font-bold text-white shadow-[0_0_20px_rgba(37,106,244,0.3)] transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(37,106,244,0.5)] active:scale-[0.98] overflow-hidden group/btn">
                            <span className="relative z-10 flex items-center justify-center gap-2">
                                Initiate Link
                                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                            </span>
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700"></div>
                        </button>
                    </div>
                </form>
            </div>
        </main>
    );
}
