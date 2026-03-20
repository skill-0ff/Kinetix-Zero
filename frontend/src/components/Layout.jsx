import React from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';

export default function Layout() {
    const location = useLocation();
    const navigate = useNavigate();

    // Don't show layout on login page
    if (location.pathname === '/login') {
        return <Outlet />;
    }

    const navItems = [
        { name: 'Overview', path: '/', icon: 'space_dashboard' },
        { name: 'Network', path: '/network', icon: 'hub' },
        { name: 'Threat', path: '/threat', icon: 'gpp_maybe' },
        { name: 'Configuration', path: '/config', icon: 'settings' },
        { name: 'Agent', path: '/agent', icon: 'memory' },
        { name: 'AI Intelligence', path: '/ai', icon: 'auto_awesome' },
    ];

    return (
        <div className="relative flex min-h-screen w-full flex-col">
            {/* Top Navigation Bar */}
            <header className="fixed top-0 left-1/2 -translate-x-1/2 z-50 w-[96%] max-w-[1440px] border-x border-b border-white/10 glass-panel px-8 py-2 rounded-b-[32px] shadow-2xl shadow-primary/5">
                <div className="max-w-full mx-auto flex items-center justify-between h-12">
                    {/* Logo */}
                    <div className="flex items-center gap-3.5 cursor-pointer" onClick={() => navigate('/')}>
                        <div className="size-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20">
                            <span className="material-symbols-outlined text-white text-xl">deployed_code</span>
                        </div>
                        <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                            Kinetix-Zero
                        </h1>
                    </div>
                    {/* Nav Center */}
                    <nav className="hidden lg:flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={({ isActive }) =>
                                    `px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all ${isActive
                                        ? 'bg-primary/20 text-primary'
                                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                                    }`
                                }
                            >
                                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                                <span className="text-[13px] font-medium">{item.name}</span>
                            </NavLink>
                        ))}
                    </nav>
                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-px bg-white/10 mx-1"></div>
                        <div
                            className="size-9 rounded-lg bg-gradient-to-br from-primary to-accent-purple p-[1px] cursor-pointer hover:scale-105 transition-transform"
                            onClick={() => navigate('/login')}
                        >
                            <div className="w-full h-full rounded-lg bg-background-dark flex items-center justify-center overflow-hidden">
                                <img alt="User" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAzNX_cgKJydEN4x4Q828tDAfjXWLNOkYBfYK7oREmuqwEoqpu_KXQx8Emhn1Y_9nL1IaCGwNJvo4yyCZyMGwmeomYRl9pEIBM1tbq0WxeWRKJM0AjN1DEpIvQLi2IEB_xZAFhRwm4x201ghevG_Rgrw_Tcfpw-m7VYpf35zOK6fqMUuy0fHEdTplpymFMx5L05laQSxjYxelJTOl2tBW3lM8tD4KepovsbMnpP_PqQIKB9AnQByRN_RX_Pw0-hdM3D4jMsjIteOVM" />
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <Outlet />

            {/* Floating AI Assistant Button */}
            <button className="fixed bottom-8 right-8 size-14 rounded-full bg-primary flex items-center justify-center shadow-2xl shadow-primary/40 group hover:scale-110 transition-transform z-50">
                <span className="material-symbols-outlined text-white text-2xl">auto_awesome</span>
                <div className="absolute -top-1 -right-1 size-4 bg-accent-purple rounded-full border-2 border-background-dark"></div>
            </button>

            {/* Required for SVGs in the components */}
            <svg width="0" height="0">
                <defs>
                    <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="rgba(37, 106, 244, 0.4)" />
                        <stop offset="100%" stopColor="rgba(37, 106, 244, 0.0)" />
                    </linearGradient>
                </defs>
            </svg>
        </div>
    );
}
