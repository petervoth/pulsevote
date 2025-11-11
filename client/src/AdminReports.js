import React, { useState, useEffect } from 'react';
import './AdminReports.css';

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const REPORT_REASONS = {
    'spam': '🚫 Spam',
    'inappropriate': '⚠️ Inappropriate Content',
    'misinformation': '🔍 Misinformation',
    'harassment': '🛑 Harassment',
    'off_topic': '📌 Off Topic',
    'duplicate': '📋 Duplicate',
    'other': '❓ Other'
};

export default function AdminReports() {
    const [reports, setReports] = useState([]);
    const [filter, setFilter] = useState('pending_review');
    const [loading, setLoading] = useState(true);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [password, setPassword] = useState('');
    const [processingId, setProcessingId] = useState(null);

    useEffect(() => {
        if (isAuthorized) {
            fetchReports();
        }
    }, [filter, isAuthorized]);

    const fetchReports = async () => {
        setLoading(true);
        try {
            const url = filter
                ? `${API_BASE}/api/topic-reports?status=${filter}`
                : `${API_BASE}/api/topic-reports`;

            const res = await fetch(url);

            if (!res.ok) {
                throw new Error('Failed to fetch reports');
            }

            const data = await res.json();
            setReports(data);
        } catch (err) {
            console.error('Error fetching reports:', err);
            alert('Failed to load reports. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const checkAuth = () => {
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
        if (!window.confirm('Approve this report and HIDE the topic?\n\nThis will:\n• Hide the topic from public view\n• Keep the topic in the database\n• Mark the report as reviewed')) {
            return;
        }

        setProcessingId(id);

        try {
            const res = await fetch(`${API_BASE}/api/topic-reports/${id}/approve`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reviewedBy: 'admin',
                    notes: 'Report approved - topic hidden from public view'
                })
            });

            if (res.ok) {
                alert('✅ Report approved. Topic has been hidden from public view.');
                fetchReports();
            } else {
                const error = await res.json();
                alert(`❌ Error: ${error.error || 'Failed to approve report'}`);
            }
        } catch (err) {
            console.error('Error approving report:', err);
            alert('❌ Network error. Failed to approve report. Please try again.');
        } finally {
            setProcessingId(null);
        }
    };

    const handleDeny = async (id) => {
        const reason = window.prompt('Enter reason for denying this report:\n(The topic will remain visible)');

        if (reason === null) {
            return;
        }

        setProcessingId(id);

        try {
            const res = await fetch(`${API_BASE}/api/topic-reports/${id}/deny`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reviewedBy: 'admin',
                    notes: reason.trim() || 'Report denied - topic remains visible'
                })
            });

            if (res.ok) {
                alert('✅ Report denied. Topic remains visible.');
                fetchReports();
            } else {
                const error = await res.json();
                alert(`❌ Error: ${error.error || 'Failed to deny report'}`);
            }
        } catch (err) {
            console.error('Error denying report:', err);
            alert('❌ Network error. Failed to deny report. Please try again.');
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
            <div className="admin-reports-container">
                <div className="admin-login">
                    <h2>🔒 Admin Login</h2>
                    <p>Enter the admin password to access the reports management panel</p>
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
        <div className="admin-reports-container">
            <div className="admin-header">
                <h1>🚨 Topic Reports Management</h1>
                <button className="btn-logout" onClick={handleLogout}>Logout</button>
            </div>

            <div className="filter-tabs">
                <button
                    className={filter === 'pending_review' ? 'active' : ''}
                    onClick={() => setFilter('pending_review')}
                >
                    ⏳ Pending Review ({reports.filter(r => r.status === 'pending_review').length})
                </button>
                <button
                    className={filter === 'reviewed' ? 'active' : ''}
                    onClick={() => setFilter('reviewed')}
                >
                    ✅ Reviewed
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
                    <p>Loading reports...</p>
                </div>
            ) : (
                <>
                    <div className="reports-grid">
                        {reports.map(report => (
                            <div key={report.id} className={`report-card ${processingId === report.id ? 'processing' : ''}`}>
                                <div className="report-header">
                                    <h3>📄 {report.title}</h3>
                                    <span className={`status-badge ${report.status} ${report.review_action ? report.review_action : ''}`}>
                                        {report.status === 'reviewed'
                                            ? (report.review_action === 'approved' ? '✅ Approved' : '❌ Denied')
                                            : '⏳ Pending Review'}
                                    </span>
                                </div>

                                <div className="report-reason">
                                    <strong>📌 Report Reason:</strong>
                                    <span className="reason-badge">
                                        {REPORT_REASONS[report.report_reason] || report.report_reason}
                                    </span>
                                </div>

                                <div className="topic-description">
                                    <strong>📝 Topic Description:</strong>
                                    <p>{report.description}</p>
                                </div>

                                <div className="report-details">
                                    <p><strong>🆔 Topic ID:</strong> {report.topic_id}</p>
                                    <p><strong>👤 Created By:</strong> {report.created_by}</p>
                                    <p><strong>📅 Topic Created:</strong> {new Date(report.created_at).toLocaleDateString()}</p>
                                    <p><strong>🚨 Reported By:</strong> {report.reported_by}</p>
                                    <p><strong>⏰ Reported At:</strong> {new Date(report.reported_at).toLocaleString()}</p>
                                    <p><strong>👁️ Topic Status:</strong> {report.hidden ? '🔒 Hidden' : '👁️ Visible'}</p>

                                    {report.reviewed_at && (
                                        <>
                                            <p><strong>✅ Reviewed:</strong> {new Date(report.reviewed_at).toLocaleString()} by {report.reviewed_by}</p>
                                            {report.notes && (
                                                <p><strong>📝 Admin Notes:</strong> {report.notes}</p>
                                            )}
                                        </>
                                    )}
                                </div>

                                {report.status === 'pending_review' && (
                                    <div className="report-actions">
                                        <button
                                            className="btn-approve"
                                            onClick={() => handleApprove(report.id)}
                                            disabled={processingId === report.id}
                                        >
                                            {processingId === report.id ? '⏳ Processing...' : '✅ Approve & Hide Topic'}
                                        </button>
                                        <button
                                            className="btn-deny"
                                            onClick={() => handleDeny(report.id)}
                                            disabled={processingId === report.id}
                                        >
                                            {processingId === report.id ? '⏳ Processing...' : '❌ Deny Report'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {reports.length === 0 && (
                        <div className="empty-state">
                            <p>📭 No reports found</p>
                            {filter !== '' && (
                                <button onClick={() => setFilter('')}>View all reports</button>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
