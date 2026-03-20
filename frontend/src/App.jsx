import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import Network from './pages/Network';
import Threat from './pages/Threat';
import Configuration from './pages/Configuration';
import Agent from './pages/Agent';
import AIIntelligence from './pages/AIIntelligence';
import Login from './pages/Login';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="network" element={<Network />} />
          <Route path="threat" element={<Threat />} />
          <Route path="config" element={<Configuration />} />
          <Route path="agent" element={<Agent />} />
          <Route path="ai" element={<AIIntelligence />} />
          <Route path="login" element={<Login />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
