import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, Cpu, Globe } from 'lucide-react';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Use URLSearchParams for x-www-form-urlencoded
            const params = new URLSearchParams();
            params.append('username', username);
            params.append('password', password);

            const response = await axios.post('http://localhost:8000/token', params);

            const { access_token } = response.data;
            localStorage.setItem('token', access_token);

            navigate('/');
        } catch (err) {
            setError(err.response?.data?.detail || 'Connection failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            height: '100vh',
            width: '100vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Background Effect */}
            <div style={{
                position: 'absolute',
                width: '40vw',
                height: '40vw',
                background: 'radial-gradient(circle, rgba(0,240,255,0.1) 0%, transparent 60%)',
                top: '-10%',
                left: '-10%',
                zIndex: -1
            }} />
            <div style={{
                position: 'absolute',
                width: '30vw',
                height: '30vw',
                background: 'radial-gradient(circle, rgba(112,0,255,0.1) 0%, transparent 60%)',
                bottom: '0%',
                right: '0%',
                zIndex: -1
            }} />

            {/* Main Card */}
            <div className="glass-panel" style={{ width: '400px', padding: '2.5rem', textAlign: 'center' }}>
                <div style={{ marginBottom: '2rem' }}>
                    <div style={{
                        display: 'inline-flex',
                        padding: '1rem',
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.05)',
                        marginBottom: '1rem',
                        border: '1px solid rgba(0,240,255,0.3)'
                    }}>
                        <Shield size={40} color="var(--primary)" />
                    </div>
                    <h1>KINETIX<span style={{ color: 'var(--primary)' }}>ZERO</span></h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                        Next-Gen Unsupervised Threat Defense
                    </p>
                </div>

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ position: 'relative' }}>
                        <Globe size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            style={{ paddingLeft: '2.5rem' }}
                            required
                        />
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Lock size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{ paddingLeft: '2.5rem' }}
                            required
                        />
                    </div>

                    {error && (
                        <div style={{
                            background: 'rgba(255, 42, 109, 0.1)',
                            color: 'var(--danger)',
                            padding: '0.8rem',
                            borderRadius: '6px',
                            fontSize: '0.9rem',
                            border: '1px solid var(--danger)'
                        }}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn-primary"
                        style={{
                            marginTop: '1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem'
                        }}
                        disabled={loading}
                    >
                        {loading ? 'Authenticating...' : (
                            <>
                                <Cpu size={20} /> Connect to Core
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
