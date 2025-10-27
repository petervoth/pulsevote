import React, { useState, useEffect } from 'react';
import './AdminAds.css';

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000";

export default function AdminAds() {
    const [submissions, setSubmissions] = useState([]);
    const [filter, setFilter] = useState('pending_review');
    const [loading, setLoading] = useState(true);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [password, setPassword] = useState('');
    const [processingId, setProcessingId] = useState(null);

    useEffect(() => {
        if (isAuthorized) {
            fetchSubmissions();
        }
    }, [filter, isAuthorized]);

    const fetchSubmissions = async () => {
        setLoading(true);
        try {
            const url = filter
                ? `${API_BASE}/api/ad-submissions?status=${filter}`
                : `${API_BASE}/api/ad-submissions`;

            const res = await fetch(url);

            if (!res.ok) {
                throw new Error('Failed to fetch submissions');
            }

            const data = await res.json();
            setSubmissions(data);
        } catch (err) {
            console.error('Error fetching submissions:', err);
            alert('Failed to load submissions. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const checkAuth = () => {
        // Replace with your actual auth logic or environment variable
        const adminPassword = process.env.REACT_APP_ADMIN_PASSWORD || 'admin123';

        if (password === adminPassword) {
            setIsAuthorized(true);
            localStorage.setItem('admin_authorized', 'true');
        } else {
            alert('Invalid password');
            setPassword('');
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            checkAuth();
        }
    };

    const handleLogout = () => {
        setIsAuthorized(false);
        localStorage.removeItem('admin_authorized');
        setPassword('');
    };

    const handleApprove = async (id) => {
        if (!window.confirm('Approve this ad and make it live?\n\nThis will:\n• Capture the payment\n• Make the ad visible on your site\n• Start the ad duration')) {
            return;
        }

        setProcessingId(id);

        try {
            const res = await fetch(`${API_BASE}/api/ad-submissions/${id}/approve`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reviewedBy: 'admin',
                    notes: 'Approved for display'
                })
            });

            if (res.ok) {
                const result = await res.json();
                alert('✅ Ad approved successfully and is now live!');
                fetchSubmissions();
            } else {
                const error = await res.json();
                alert(`❌ Error: ${error.error || 'Failed to approve ad'}`);
            }
        } catch (err) {
            console.error('Error approving ad:', err);
            alert('❌ Network error. Failed to approve ad. Please try again.');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (id) => {
        const reason = window.prompt('Enter reason for rejection:\n(This will be logged and the payment will be cancelled)');

        if (!reason || reason.trim() === '') {
            return;
        }

        setProcessingId(id);

        try {
            const res = await fetch(`${API_BASE}/api/ad-submissions/${id}/reject`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reviewedBy: 'admin',
                    notes: reason.trim()
                })
            });

            if (res.ok) {
                alert('✅ Ad rejected successfully');
                fetchSubmissions();
            } else {
                const error = await res.json();
                alert(`❌ Error: ${error.error || 'Failed to reject ad'}`);
            }
        } catch (err) {
            console.error('Error rejecting ad:', err);
            alert('❌ Network error. Failed to reject ad. Please try again.');
        } finally {
            setProcessingId(null);
        }
    };

    // Check if already authorized on mount
    useEffect(() => {
        const authorized = localStorage.getItem('admin_authorized');
        if (authorized === 'true') {
            setIsAuthorized(true);
        }
    }, []);

    // Login screen
    if (!isAuthorized) {
        return (
            <div className="admin-ads-container">
                <div className="admin-login">
                    <h2>🔒 Admin Login</h2>
                    <p>Enter the admin password to access the ad management panel</p>
                    <div className="login-form">
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Enter admin password"
                            autoFocus
                        />
                        <button onClick={checkAuth}>Login</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-ads-container">
            <div className="admin-header">
                <h1>📊 Ad Submissions Management</h1>
                <button className="btn-logout" onClick={handleLogout}>Logout</button>
            </div>

            <div className="filter-tabs">
                <button
                    className={filter === 'pending_review' ? 'active' : ''}
                    onClick={() => setFilter('pending_review')}
                >
                    ⏳ Pending Review
                </button>
                <button
                    className={filter === 'live' ? 'active' : ''}
                    onClick={() => setFilter('live')}
                >
                    ✅ Live
                </button>
                <button
                    className={filter === 'rejected' ? 'active' : ''}
                    onClick={() => setFilter('rejected')}
                >
                    ❌ Rejected
                </button>
                <button
                    className={filter === '' ? 'active' : ''}
                    onClick={() => setFilter('')}
                >
                    📋 All
                </button>
            </div>

            {loading ? (
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading submissions...</p>
                </div>
            ) : (
                <>
                    <div className="submissions-grid">
                        {submissions.map(sub => (
                            <div key={sub.id} className={`submission-card ${processingId === sub.id ? 'processing' : ''}`}>
                                <div className="submission-header">
                                    <h3>{sub.company_name}</h3>
                                    <span className={`status-badge ${sub.status}`}>
                                        {sub.status.replace('_', ' ')}
                                    </span>
                                </div>

                                <div className="submission-preview">
                                    <img src={sub.image_url} alt={sub.company_name} />
                                    <div className="preview-overlay">
                                        <p className="ad-text">{sub.ad_text}</p>
                                    </div>
                                </div>

                                <div className="submission-details">
                                    <p><strong>🔗 Link:</strong> <a href={sub.link_url} target="_blank" rel="noopener noreferrer">{sub.link_url}</a></p>
                                    <p><strong>📧 Contact:</strong> {sub.buyer_email}</p>
                                    <p><strong>⏱️ Duration:</strong> {sub.duration_days} days</p>
                                    <p><strong>💰 Amount:</strong> ${(sub.amount_cents / 100).toFixed(2)}</p>
                                    <p><strong>📅 Submitted:</strong> {new Date(sub.submitted_at).toLocaleString()}</p>

                                    {sub.start_date && sub.status === 'pending_review' && (
                                        <p><strong>🗓️ Requested Start:</strong> {new Date(sub.start_date).toLocaleDateString()}</p>
                                    )}

                                    {sub.status === 'live' && sub.start_date && sub.end_date && (
                                        <>
                                            <p><strong>🟢 Started:</strong> {new Date(sub.start_date).toLocaleString()}</p>
                                            <p><strong>🔴 Expires:</strong> {new Date(sub.end_date).toLocaleString()}</p>
                                        </>
                                    )}

                                    {sub.reviewed_at && (
                                        <p><strong>👤 Reviewed:</strong> {new Date(sub.reviewed_at).toLocaleString()} by {sub.reviewed_by}</p>
                                    )}
                                </div>

                                {sub.status === 'pending_review' && (
                                    <div className="submission-actions">
                                        <button
                                            className="btn-approve"
                                            onClick={() => handleApprove(sub.id)}
                                            disabled={processingId === sub.id}
                                        >
                                            {processingId === sub.id ? '⏳ Processing...' : '✅ Approve & Go Live'}
                                        </button>
                                        <button
                                            className="btn-reject"
                                            onClick={() => handleReject(sub.id)}
                                            disabled={processingId === sub.id}
                                        >
                                            {processingId === sub.id ? '⏳ Processing...' : '❌ Reject'}
                                        </button>
                                    </div>
                                )}

                                {sub.notes && (
                                    <div className="submission-notes">
                                        <strong>📝 Notes:</strong> {sub.notes}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {submissions.length === 0 && (
                        <div className="empty-state">
                            <p>📭 No submissions found</p>
                            {filter !== '' && (
                                <button onClick={() => setFilter('')}>View all submissions</button>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}