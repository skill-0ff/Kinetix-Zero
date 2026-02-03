import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
    Activity, ShieldAlert, FileText, Settings, LogOut,
    ArrowUpRight, ArrowDownRight, Server, Database
} from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
    AreaChart, Area
} from 'recharts';

const Dashboard = () => {

    const navigate = useNavigate();

    // State for Real Data
    const [status, setStatus] = useState({ uptime: 0, mongo: false, qdrant: false, vectors: 0, threats_active: 0 });
    const [threats, setThreats] = useState([]);
    const [graphData, setGraphData] = useState([]);
    const [config, setConfig] = useState(null); // Load config for thresholds
    const [stats, setStats] = useState({ trend_percent: 0 });

    // Poll API
    useEffect(() => {
        const fetchData = async () => {
            try {
                const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

                // 1. Status
                const statusRes = await axios.get('http://localhost:8000/status', { headers });
                setStatus(statusRes.data);

                // 2. Metrics (Graph)
                const metricsRes = await axios.get('http://localhost:8000/metrics?limit=30', { headers });
                // Reverse because API returns newest first (desc list) -> Graph needs oldest first (asc x-axis)
                let rawGraph = metricsRes.data.reverse().map(m => ({
                    time: new Date(m.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    eps: m.eps_in
                }));

                // Simulation Override REMOVED from inside Try block - moved to after/independent
                setGraphData(rawGraph);

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
        const interval = setInterval(fetchData, 2000); // Poll every 2s
        return () => clearInterval(interval);
    }, []);

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
        localStorage.removeItem('token');
        navigate('/login');
    };

    return (
        <div style={{ minHeight: '100vh', paddingBottom: '2rem' }}>
            {/* Navbar */}
            <nav className="glass-panel" style={{
                position: 'sticky', top: 0, zIndex: 100,
                padding: '1rem 2rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                margin: '0 0 2rem 0', borderRadius: '0 0 12px 12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <ShieldAlert color="var(--primary)" size={32} />
                    <h2 style={{ fontSize: '1.5rem' }}>KINETIX<span style={{ color: 'var(--primary)' }}>ZERO</span></h2>
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    <button className="glass-card" style={{ padding: '0.5rem', background: 'transparent' }} title="Settings">
                        <Settings size={20} color="var(--text-muted)" />
                    </button>


                    <button onClick={handleLogout} className="glass-card" style={{
                        padding: '0.5rem 1rem',
                        background: 'rgba(255, 42, 109, 0.1)',
                        border: '1px solid var(--danger)',
                        color: 'var(--danger)',
                        display: 'flex', gap: '0.5rem', alignItems: 'center'
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
                        padding: '1.5rem',
                        position: 'relative',
                        overflow: 'hidden',
                        border: epsState.pulse ? '2px solid var(--danger)' : undefined,
                        boxShadow: epsState.pulse ? '0 0 20px rgba(255, 42, 109, 0.4)' : undefined,
                        animation: epsState.pulse ? 'pulse-red 1s infinite' : undefined
                    }}>
                        <Activity size={40} style={{ position: 'absolute', right: -5, top: -5, opacity: 0.1 }} />
                        <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Inbound Traffic</h4>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                            <span style={{ fontSize: '2.5rem', fontWeight: 700, color: epsState.color }}>
                                {graphData.length > 0 ? graphData[graphData.length - 1].eps : 0}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>EPS</span>
                        </div>
                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', fontSize: '0.8rem', color: epsState.color }}>
                            {stats.trend_percent >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                            {Math.abs(stats.trend_percent)}% from last hour
                        </div>
                    </div>

                    {/* Card 2: Threat Detection */}
                    <div className="glass-card col-span-3" style={{ padding: '1.5rem' }}>
                        <ShieldAlert size={40} style={{ position: 'absolute', right: -5, top: -5, opacity: 0.1 }} />
                        <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Active Threats</h4>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                            <span style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--danger)' }}>{status.threats_active}</span>
                            <span style={{ color: 'var(--text-muted)' }}>Detected</span>
                        </div>
                        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            In Archive
                        </div>
                    </div>

                    {/* Card 3: Memory Status */}
                    <div className="glass-card col-span-3" style={{ padding: '1.5rem' }}>
                        <Database size={40} style={{ position: 'absolute', right: -5, top: -5, opacity: 0.1 }} />
                        <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>AI Memory</h4>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '1rem' }}>
                            <span style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--warning)' }}>
                                {status.vectors}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>Vectors</span>
                        </div>

                        {/* Breakdown */}
                        <div style={{ display: 'flex', gap: '0.2rem', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                            <div style={{ flex: stats.memory?.safe || 1, background: 'var(--success)', opacity: 0.7 }} />
                            <div style={{ flex: stats.memory?.anomaly || 0, background: 'var(--accent)' }} />
                            <div style={{ flex: stats.memory?.threat || 0, background: 'var(--danger)' }} />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <span style={{ color: 'var(--success)' }}>{stats.memory?.safe || 0} Safe</span>
                            <span style={{ color: 'var(--accent)' }}>{stats.memory?.anomaly || 0} New</span>
                            <span style={{ color: 'var(--danger)' }}>{stats.memory?.threat || 0} Bad</span>
                        </div>
                    </div>

                    {/* Card 4: System Status */}
                    <div className="glass-card col-span-3" style={{ padding: '1.5rem' }}>
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
                            <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
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
                        <h3 style={{ marginBottom: '1.5rem' }}>Traffic Velocity</h3>
                        <div style={{ width: '100%', height: '300px' }}>
                            <ResponsiveContainer>
                                <AreaChart data={graphData}>
                                    <defs>
                                        <linearGradient id="colorEps" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#00f0ff" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="time" stroke="#555" />
                                    <YAxis stroke="#555" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }}
                                        itemStyle={{ color: '#fff' }}
                                    />
                                    <Area type="monotone" dataKey="eps" stroke="#00f0ff" fillOpacity={1} fill="url(#colorEps)" isAnimationActive={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="glass-card col-span-4" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {/* Header Stats */}
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)' }}>
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
