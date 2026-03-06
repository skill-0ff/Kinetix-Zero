import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

// Simple Auth Guard
const ProtectedRoute = ({ children }) => {
    const token = sessionStorage.getItem('token');
    if (!token) {
        return <Navigate to="/login" replace />;
    }
    return children;
};

const PlaceholderPage = ({ title }) => (
    <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        color: 'var(--text-main)',
        background: 'var(--bg-dark)'
    }}>
        <div style={{ textAlign: 'center' }}>
            <h1>{title}</h1>
            <p style={{ color: 'var(--text-muted)' }}>Under Construction</p>
        </div>
    </div>
);

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={
                    <ProtectedRoute>
                        <Dashboard />
                    </ProtectedRoute>
                } />
                <Route path="/status" element={<ProtectedRoute><PlaceholderPage title="System Status" /></ProtectedRoute>} />
                <Route path="/threat" element={<ProtectedRoute><PlaceholderPage title="Threat Intelligence" /></ProtectedRoute>} />
                <Route path="/analysis" element={<ProtectedRoute><PlaceholderPage title="Deep Analysis" /></ProtectedRoute>} />
                <Route path="/db" element={<ProtectedRoute><PlaceholderPage title="Database Management" /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><PlaceholderPage title="Settings" /></ProtectedRoute>} />
                <Route path="/account" element={<ProtectedRoute><PlaceholderPage title="User Account" /></ProtectedRoute>} />
            </Routes>
        </Router>
    );
}

export default App;
