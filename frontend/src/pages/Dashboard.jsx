import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Activity, ShieldAlert, FileText, Settings, LogOut,
    ArrowUpRight, ArrowDownRight, Server, Database,
    Home, Layout, Shield, Search, User, Sun, Moon
} from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
    AreaChart, Area, CartesianGrid
} from 'recharts';

const Dashboard = () => {

    const navigate = useNavigate();
    const location = useLocation();

    // State for Real Data
    const [status, setStatus] = useState({
        uptime: 0, mongo: false, qdrant: false, vectors: 0,
        threats_active: 0, threats_new: 0, threats_known: 0, threats_fp: 0
    });
    const [threats, setThreats] = useState([]);
    // Initialize with placeholder data so axes always show
    const [graphData, setGraphData] = useState(() => {
        return Array.from({ length: 10 }).map((_, i) => ({
            time: '00:00', eps: 0, safe: 0, new: 0, known: 0, fp: 0, ai_eps: 0
        }));
    });
    const [config, setConfig] = useState(null); // Load config for thresholds
    const [stats, setStats] = useState({ trend_percent: 0 });
    const [theme, setTheme] = useState('dark');
    const [timeFilter, setTimeFilter] = useState('1m');

    // Theme Toggle Effect
    useEffect(() => {
        if (theme === 'light') {
            document.body.classList.add('light-theme');
        } else {
            document.body.classList.remove('light-theme');
        }
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    // Poll API
    useEffect(() => {
        const fetchData = async () => {
            try {
                const headers = { Authorization: `Bearer ${sessionStorage.getItem('token')}` };

                // Map filter to limit
                const limitMap = { '1s': 10, '1m': 60, '1h': 3600 };
                const limit = limitMap[timeFilter] || 60;

                // 1. Status
                const statusRes = await axios.get('http://localhost:8000/status', { headers });
                setStatus(statusRes.data);

                // 2. Metrics (Graph)
                const metricsRes = await axios.get(`http://localhost:8000/metrics?limit=${limit}`, { headers });
                // Reverse because API returns newest first (desc list) -> Graph needs oldest first (asc x-axis)
                let rawGraph = metricsRes.data.reverse().map(m => {
                    // Calculate Total AI Analyzed Count
                    const aiCount = (m.verdict_safe || 0) + (m.verdict_threat || 0) + (m.verdict_new || 0) + (m.verdict_fp || 0);
                    return {
                        time: new Date(m.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                        eps: m.eps_in ?? m.eps ?? 0,
                        ai_eps: aiCount,
                        safe: m.verdict_safe || 0,
                        new: m.verdict_new || 0,
                        known: m.verdict_threat || 0,
                        fp: m.verdict_fp || 0
                    };
                });

                if (rawGraph.length > 0) setGraphData(rawGraph);

                // 3. Threats
                const threatsRes = await axios.get('http://localhost:8000/threats?limit=5', { headers });
                setThreats(threatsRes.data);

                // 4. Config (Once or periodic)
                if (!config) {
                    const configRes = await axios.get('http://localhost:8000/config', { headers });
                    setConfig(configRes.data);
                }

                // 5. Stats (Trend)
                const statsRes = await axios.get('http://localhost:8000/stats', { headers });
                setStats(statsRes.data);

            } catch (e) {
                if (e.response?.status === 401) handleLogout();
                console.error("Fetch Error", e);
            }


        };

        fetchData(); // Initial
        const interval = setInterval(fetchData, 1000); // Poll every 1s
        return () => clearInterval(interval);
    }, [timeFilter]); // Re-run when filter changes


    const formatUptime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}h ${m}m`;
    };

    // Helper: Determine EPS Color/State
    const getEpsState = () => {
        // Fallback defaults if config is null (API down)
        const defaults = { max_sequence: 100, ddos_threshold: 50 };
        const cfg = config || defaults;

        if (graphData.length === 0) return { color: 'var(--primary)', status: 'Normal', pulse: false };

        const currentEps = graphData[graphData.length - 1].eps;
        const maxSeq = cfg.max_sequence || 100;
        const ddosThresh = cfg.ddos_threshold || 50;

        if (currentEps >= maxSeq + ddosThresh) return { color: 'var(--danger)', status: 'DDoS ALERT', pulse: true };
        if (currentEps > maxSeq) return { color: 'var(--warning)', status: 'High Load', pulse: false };
        return { color: 'var(--primary)', status: 'Normal', pulse: false };
    };

    const epsState = getEpsState();

    const handleLogout = () => {
        sessionStorage.removeItem('token');
        navigate('/login');
    };

    return (
        <div style={{ minHeight: '100vh', paddingBottom: '2rem' }}>
            {/* Navbar */}
            {/* Navbar */}
            <nav className="glass-panel" style={{
                position: 'sticky', top: '0.2rem', zIndex: 100,
                padding: '0.8rem 2rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                margin: '0.5rem 2rem 0 2rem', borderRadius: '12px'
            }}>
                {/* Left: Logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: '200px' }}>
                    <ShieldAlert color="var(--primary)" size={28} />
                    <h2 style={{ fontSize: '1.4rem' }}>KINETIX<span style={{ color: 'var(--primary)' }}>ZERO</span></h2>
                </div>
                {/* Center: Navigation */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {[
                        { icon: Home, label: 'Home', path: '/' },
                        { icon: Layout, label: 'Dashboard', path: '/' },
                        { icon: Activity, label: 'Status', path: '/status' },
                        { icon: Shield, label: 'Threat', path: '/threat' },
                        { icon: Search, label: 'Analysis', path: '/analysis' },
                        { icon: Database, label: 'DB', path: '/db' },
                        { icon: Settings, label: 'Settings', path: '/settings' },
                        { icon: User, label: 'Account', path: '/account' },
                    ].map((item, idx) => {
                        const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
                        return (
                            <button
                                key={idx}
                                onClick={() => navigate(item.path)}
                                className="glass-card"
                                title={item.label}
                                style={{
                                    padding: '0.6rem',
                                    background: isActive ? 'rgba(0, 240, 255, 0.1)' : 'transparent',
                                    border: isActive ? '1px solid var(--primary)' : '1px solid transparent',
                                    color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', transition: 'all 0.2s', borderRadius: '8px'
                                }}>
                                <item.icon size={20} />
                            </button>
                        );
                    })}
                </div>

                {/* Right: Actions */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', minWidth: '200px', justifyContent: 'flex-end' }}>
                    <button onClick={toggleTheme} className="glass-card" style={{
                        padding: '0.6rem',
                        background: 'transparent',
                        border: '1px solid var(--glass-border)',
                        color: 'var(--text-muted)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }} title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}>
                        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                    </button>

                    <button onClick={handleLogout} className="glass-card" style={{
                        padding: '0.5rem 1rem',
                        background: 'rgba(255, 42, 109, 0.1)',
                        border: '1px solid var(--danger)',
                        color: 'var(--danger)',
                        display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer'
                    }}>
                        <LogOut size={16} /> Disconnect
                    </button>
                </div>
            </nav>

            <div className="container">
                {/* Status Metrics Row */}
                <div className="dashboard-grid">
                    {/* Card 1: EPS (Inbound Traffic) */}
                    <div className="glass-card col-span-3" style={{
                        padding: '1rem',
                        position: 'relative',
                        overflow: 'hidden',
                        border: epsState.pulse ? '2px solid var(--danger)' : undefined,
                        boxShadow: epsState.pulse ? '0 0 20px rgba(255, 42, 109, 0.4)' : undefined,
                        animation: epsState.pulse ? 'pulse-red 1s infinite' : undefined
                    }}>
                        <Activity size={40} style={{ position: 'absolute', right: -5, top: -5, opacity: 0.1 }} />
                        <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Inbound Traffic</h4>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2.3rem', marginBottom: '1.2rem' }}>
                            {/* EPS Row */}
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.8rem' }}>
                                <span style={{ fontSize: '3.5rem', fontWeight: 700, color: epsState.color, lineHeight: 1 }}>
                                    {graphData.length > 0 ? graphData[graphData.length - 1].eps : 0}
                                </span>
                                <span style={{ color: 'var(--text-muted)' }}>EPS</span>
                            </div>

                            {/* Separator */}
                            <div style={{ height: '40px', borderLeft: 'var(--glass-border)' }}></div>

                            {/* Analyzed Row */}
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.8rem' }}>
                                <span style={{ fontSize: '2rem', fontWeight: 700, color: '#a855f7', lineHeight: 1 }}>
                                    {graphData.length > 0 ? graphData[graphData.length - 1].ai_eps : 0}
                                </span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Analyzed</span>
                            </div>
                        </div>
                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', fontSize: '0.8rem', color: epsState.color }}>
                            {stats.trend_percent >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                            {Math.abs(stats.trend_percent)}% from last hour
                        </div>
                    </div>

                    {/* Card 2: Threat Detection */}
                    <div className="glass-card col-span-3" style={{ padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                        <ShieldAlert size={40} style={{ position: 'absolute', right: -5, top: -5, opacity: 0.1 }} />
                        <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Active Threats</h4>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.8rem', marginTop: '1rem', marginBottom: '1rem' }}>
                            <span style={{ fontSize: '3.5rem', fontWeight: 700, color: 'var(--danger)', lineHeight: 1 }}>{status.threats_active}</span>
                            <span style={{ color: 'var(--text-muted)' }}>Detected</span>
                        </div>

                        {/* Breakdown: Minimalist Stat Row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0.5rem', marginTop: 'auto' }}>
                            {[
                                { label: 'New', count: status.threats_new, color: 'var(--accent)' },
                                { label: 'Known', count: status.threats_known, color: 'var(--danger)' },
                                { label: 'F/P', count: status.threats_fp, color: '#00f0ff' }
                            ].map((item, idx) => (
                                <div key={idx} style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: item.color, marginRight: '6px', marginBottom: '1px' }}></span>
                                        {item.label}
                                    </div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                        {item.count || 0}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Card 3: Memory Status */}
                    <div className="glass-card col-span-3" style={{ padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                        <Database size={40} style={{ position: 'absolute', right: -5, top: -5, opacity: 0.1 }} />
                        <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>AI Memory</h4>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.8rem', marginBottom: '1rem', marginTop: '1rem' }}>
                            <span style={{ fontSize: '3.5rem', fontWeight: 700, color: 'var(--warning)', lineHeight: 1 }}>
                                {status.vectors}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>Vectors</span>
                        </div>

                        {/* Memory Breakdown: Minimalist Stat Row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0.5rem', marginTop: 'auto' }}>
                            {[
                                { label: 'Safe', count: stats.memory?.safe, color: 'var(--success)' },
                                { label: 'New', count: stats.memory?.anomaly, color: 'var(--accent)' },
                                { label: 'Threat', count: stats.memory?.threat, color: 'var(--danger)' }
                            ].map((item, idx) => (
                                <div key={idx} style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: item.color, marginRight: '6px', marginBottom: '1px' }}></span>
                                        {item.label}
                                    </div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                        {item.count || 0}
                                    </div>
                                </div>
                            ))}
                        </div>


                    </div>

                    {/* Card 4: System Status */}
                    <div className="glass-card col-span-3" style={{ padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                        <Server size={40} style={{ position: 'absolute', right: -5, top: -5, opacity: 0.1 }} />
                        <h4 style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>System Health</h4>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            {/* Component List */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                <span>AI Core</span>
                                <span style={{ color: status.core_status ? 'var(--success)' : 'var(--danger)' }}>
                                    {status.core_status ? "ONLINE" : "OFFLINE"}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                <span>Qdrant DB</span>
                                <span style={{ color: status.qdrant ? 'var(--success)' : 'var(--danger)' }}>
                                    {status.qdrant ? "ONLINE" : "OFFLINE"}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                <span>Mongo DB</span>
                                <span style={{ color: status.mongo ? 'var(--success)' : 'var(--danger)' }}>
                                    {status.mongo ? "ONLINE" : "OFFLINE"}
                                </span>
                            </div>

                            {/* Uptime Footer */}
                            <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: 'var(--glass-border)' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>AI Uptime</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                    {status.core_status ? formatUptime(status.uptime) : "---"}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Graph Row */}
                <div className="dashboard-grid">
                    <div className="glass-card col-span-8" style={{ padding: '1.5rem', minHeight: '400px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0 }}>Traffic Velocity</h3>
                            {/* Legend */}
                            <div style={{ display: 'flex', gap: '0.8rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00f0ff' }}></span>Total</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00ff88' }}></span>Safe</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)' }}></span>AI Detect</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--danger)' }}></span>Confirm Threat</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ffae00' }}></span>FP</div>
                            </div>

                            {/* Time Filters */}
                            <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.2rem', borderRadius: '6px' }}>
                                {['1s', '1m', '1h'].map(tf => (
                                    <button
                                        key={tf}
                                        onClick={() => setTimeFilter(tf)}
                                        style={{
                                            padding: '0.2rem 0.5rem',
                                            fontSize: '0.75rem',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            background: timeFilter === tf ? 'var(--primary)' : 'transparent',
                                            color: timeFilter === tf ? '#000' : 'var(--text-muted)',
                                            fontWeight: timeFilter === tf ? 600 : 400
                                        }}
                                    >
                                        {tf}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div style={{ width: '100%', height: '400px' }}>
                            <ResponsiveContainer>
                                <AreaChart data={graphData} margin={{ top: 20, right: 10, left: 10, bottom: 50 }}>
                                    <defs>
                                        <linearGradient id="colorEps" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#00f0ff" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                    <XAxis
                                        dataKey="time"
                                        stroke="#888888"
                                        tick={{ fill: '#888888', fontSize: 13 }}
                                        tickLine={{ stroke: '#888888' }}
                                        label={{ value: 'Time (Last Hour)', position: 'insideBottom', offset: -15, fill: '#888888', fontSize: 13 }}
                                    />
                                    <YAxis
                                        stroke="#888888"
                                        tick={{ fill: '#888888', fontSize: 13 }}
                                        tickLine={{ stroke: '#888888' }}
                                        domain={[0, 'auto']}
                                        tickFormatter={(value) => value === 0 ? "" : value}
                                        label={{ value: 'EPS', angle: -90, position: 'insideLeft', fill: '#888888', fontSize: 13, offset: 5 }}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }}
                                        itemStyle={{ color: '#fff' }}
                                    />
                                    <Area type="monotone" dataKey="eps" stroke="#00f0ff" fill="url(#colorEps)" fillOpacity={1} name="Total EPS" />
                                    <Area type="monotone" dataKey="safe" stroke="#00ff88" fill="#00ff88" fillOpacity={0.2} name="Safe" />
                                    <Area type="monotone" dataKey="new" stroke="#b300ff" fill="#b300ff" fillOpacity={0.3} name="AI Detect" />
                                    <Area type="monotone" dataKey="known" stroke="#ff2a6d" fill="#ff2a6d" fillOpacity={0.4} name="Confirm Threat" />
                                    <Area type="monotone" dataKey="fp" stroke="#ffae00" fill="#ffae00" fillOpacity={0.5} name="False Positives" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="glass-card col-span-4" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {/* Header Stats */}
                        <div style={{ padding: '1.5rem', borderBottom: 'var(--glass-border)', background: 'rgba(0,0,0,0.02)' }}>
                            <h3 style={{ marginBottom: '1rem' }}>Active Threat Monitor</h3>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ flex: 1, padding: '0.8rem', background: 'rgba(112, 0, 255, 0.1)', borderRadius: '8px', border: '1px solid var(--accent)' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px' }}>AI Anomalies</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>
                                        {threats.filter(t => t.verdict === 'NEW ANOMALY').length}
                                    </div>
                                </div>
                                <div style={{ flex: 1, padding: '0.8rem', background: 'rgba(255, 42, 109, 0.1)', borderRadius: '8px', border: '1px solid var(--danger)' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '1px' }}>Intel Matches</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>
                                        {threats.filter(t => t.verdict !== 'NEW ANOMALY').length}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* List Area */}
                        <div style={{ padding: '1rem', overflowY: 'auto', maxHeight: '400px' }}>
                            {threats.length === 0 ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '2rem' }}>No active threats detected.</p> :
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {threats.map((t) => {
                                        const isAi = t.verdict === 'NEW ANOMALY';
                                        const color = isAi ? 'var(--accent)' : 'var(--danger)';
                                        const bg = isAi ? 'rgba(112, 0, 255, 0.05)' : 'rgba(255, 42, 109, 0.05)';

                                        return (
                                            <div key={t._id} style={{
                                                padding: '1rem',
                                                background: bg,
                                                borderLeft: `3px solid ${color}`,
                                                borderRadius: '4px',
                                                display: 'grid',
                                                gridTemplateColumns: 'min-content 1fr min-content',
                                                gap: '1rem',
                                                alignItems: 'center'
                                            }}>
                                                <div style={{
                                                    width: '40px', height: '40px',
                                                    background: color, borderRadius: '50%',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: '#000', fontWeight: 'bold'
                                                }}>
                                                    {isAi ? 'AI' : 'TI'}
                                                </div>

                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                                                        <span style={{ fontWeight: 600, color: 'white' }}>{isAi ? 'Behavioral Anomaly' : 'Known Threat'}</span>
                                                        <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{t.timestamp ? new Date(t.timestamp * 1000).toLocaleTimeString() : 'Now'}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                        SRC: <span style={{ color: color }}>{t.src_ip || '???.???.???.???'}</span>
                                                        <span style={{ margin: '0 0.5rem', opacity: 0.3 }}>|</span>
                                                        DST: {t.event?.dest_port || '???'} {t.event?.proto ? `(${t.event.proto})` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
