import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'http://localhost:8000/api/v1';

/**
 * Hook for fetching and streaming Kinetix-Zero data.
 * @param {string} collection - 'events', 'metrics', or 'ddos'
 * @param {object} initialQuery - Filter/Sort/Limit for initial fetch
 */
export const useKinetixData = (collection, initialQuery = {}) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // 1. Initial Data Fetch
    const fetchData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            setLoading(true);
            const response = await fetch(`${API_BASE}/data/${collection}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    filter: initialQuery.filter || {},
                    limit: initialQuery.limit ?? 50,
                    sort_by: initialQuery.sort_by || 'timestamp',
                    order: initialQuery.order || -1
                })
            });

            if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);

            const result = await response.json();
            setData(result.data);
            setLoading(false);
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    }, [collection, initialQuery]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // 2. Real-time Subscription
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;

        // Note: SSE doesn't natively support Bearer headers easily in standard EventSource.
        // For a production app, we'd pass token in query param or use a polyfill.
        // For this implementation, we assume the server can handle token in query if needed,
        // but since standard EventSource is limited, we'll suggest a workaround or use polling 
        // if necessary. However, the server expects Depends(get_current_user).

        // FIX: Re-implementing connection with a small hack for token-in-query for SSE
        const eventSource = new EventSource(`${API_BASE}/stream?token=${token}`);

        eventSource.onmessage = (event) => {
            if (event.data === ': heartbeat') return;

            try {
                const update = JSON.parse(event.data);
                if (update.type === collection) {
                    setData(prev => {
                        // Prepend new data if it doesn't already exist (dedup by _id)
                        const exists = prev.some(item => item._id === update.doc._id);
                        if (exists) return prev;
                        return [update.doc, ...prev].slice(0, 100); // Cap at 100 locally
                    });
                }
            } catch (err) {
                console.error('SSE Parse Error:', err);
            }
        };

        eventSource.onerror = (err) => {
            console.error('SSE Connection Error:', err);
            eventSource.close();
        };

        return () => eventSource.close();
    }, [collection]);

    return { data, loading, error, refresh: fetchData };
};
