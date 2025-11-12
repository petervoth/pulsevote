// src/MainApp.js - MAPLIBRE GL JS v5 VERSION
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { io } from "socket.io-client";
import { supabase } from "./supabaseClient";
import "./App.css";
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000";
const socket = io(API_BASE);

const STANCE_COLOR = {
    "-No": "#648FFF",
    No: "#785EF0",
    Neutral: "#DC267F",
    Yes: "#FE6100",
    "Yes+": "#FFB000",
};

const stanceWeights = {
    '-No': -2,
    'No': -1,
    'Neutral': 0,
    'Yes': 1,
    'Yes+': 2,
};

const topicIcons = {
    "Agriculture and Agri-Food": "🌾",
    "Elections": "🗳️",
    "Employment and Social Development": "💼",
    "Environment and Climate Change": "🌱",
    "Entertainment": "🎭",
    "Finance": "💰",
    "Fisheries and Oceans": "🐟",
    "Global Affairs": "🌍",
    "Health": "🏥",
    "Heritage": "🏛️",
    "Immigration, Refugees and Citizenship": "🛂",
    "Indigenous Services": "🧑‍🤝‍🧑",
    "Infrastructure": "🏗️",
    "Innovation, Science and Economic Development": "🔬",
    "Justice": "⚖️",
    "Local Affairs": "🏘️",
    "National Defence": "🛡️",
    "Natural Resources": "⛏️",
    "Public Safety": "🚨",
    "Public Services and Procurement": "📦",
    "PulseVote - Site Suggestions": "💡",
    "Transport": "🚗",
    "Veterans Affairs": "🎖️"
};

const AD_PRICING = {
    7: 35,
    14: 60,
    30: 100
};

const FILTERED_WORDS = [
    "fuck",
    "shit",
    "cunt",
    "motherfucker",
    "asshole",
];

function containsFilteredWords(text) {
    const lowerText = text.toLowerCase();
    return FILTERED_WORDS.some(word => lowerText.includes(word));
}

function mergeMostRecentPerUser(existing, incoming) {
    const map = new Map();
    function add(p) {
        if (!p?.user_id) return;
        const key = String(p.user_id);
        const ts = p.created_at ? new Date(p.created_at).getTime() : 0;
        const prev = map.get(key);
        if (!prev || ts > new Date(prev.created_at).getTime()) {
            map.set(key, p);
        }
    }
    existing.forEach(add);
    incoming.forEach(add);
    return Array.from(map.values());
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function AdCard({ adIndex, liveAds }) {
    if (liveAds.length === 0) {
        return (
            <li className="feed-item ad-card no-ads">
                <div>No ads available</div>
            </li>
        );
    }

    const ad = liveAds[adIndex % liveAds.length];

    return (
        <li
            className="feed-item ad-card"
            onClick={() => window.open(ad.link_url, '_blank')}
        >
            <img
                src={ad.image_url}
                alt={ad.company_name}
            />
            <div className="ad-overlay">
                <div className="sponsored-badge">
                    SPONSORED
                </div>
                <div className="ad-company-name">
                    {ad.company_name}
                </div>
                <div className="ad-text">
                    {ad.ad_text}
                </div>
                <div className="ad-cta">
                    Learn More →
                </div>
            </div>
        </li>
    );
}

// Haversine formula to calculate distance between two coordinates in km
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function getAvgBoxColor(avg) {
    if (avg === "–") return "avg-neutral";
    if (avg < -1) return 'stance-no-strong';
    if (avg < -0.1) return 'stance-no';
    if (avg < 0.1) return 'stance-neutral';
    if (avg <= 1.00) return 'stance-yes';
    return 'stance-yes-strong';
}

const validateImage = (file) => {
    return new Promise((resolve, reject) => {
        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
            reject('Image must be less than 5MB');
            return;
        }

        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            reject('Image must be JPG, PNG, or WebP format');
            return;
        }

        const img = new Image();
        img.onload = () => {
            const width = img.width;
            const height = img.height;
            const minWidth = 280;
            const minHeight = 60;
            const aspectRatio = width / height;
            const targetAspectRatio = 4.67;

            if (width < minWidth || height < minHeight) {
                reject(`Image must be at least ${minWidth}x${minHeight} pixels`);
                return;
            }

            if (Math.abs(aspectRatio - targetAspectRatio) > 0.15) {
                reject('Image aspect ratio should be close to 14:3 (recommended: 280x60)');
                return;
            }

            resolve(true);
        };

        img.onerror = () => {
            reject('Failed to load image');
        };

        img.src = URL.createObjectURL(file);
    });
};

function CheckoutForm({ adFormData, validateForm, onSuccess, onError, darkMode }) {
    const stripe = useStripe();
    const elements = useElements();
    const [processing, setProcessing] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (!validateForm || typeof validateForm !== 'function') {
            alert('Form validation error. Please refresh and try again.');
            return;
        }

        const isValid = validateForm();
        if (!isValid) {
            return;
        }

        if (!stripe || !elements) {
            alert('Payment system not ready. Please refresh and try again.');
            return;
        }

        setProcessing(true);

        try {
            const intentResponse = await fetch(`${API_BASE}/api/stripe/create-payment-intent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: AD_PRICING[adFormData.duration],
                    email: adFormData.email,
                    companyName: adFormData.companyName
                })
            });

            if (!intentResponse.ok) {
                const errorText = await intentResponse.text();
                throw new Error(`Failed to create payment intent: ${errorText}`);
            }

            const { clientSecret, paymentIntentId } = await intentResponse.json();

            const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
                payment_method: {
                    card: elements.getElement(CardElement),
                    billing_details: {
                        email: adFormData.email,
                        name: adFormData.companyName
                    }
                }
            });

            if (error) {
                onError(error.message);
                setProcessing(false);
                return;
            }

            if (paymentIntent.status === 'requires_capture') {
                await onSuccess(paymentIntentId);
            } else {
                throw new Error(`Unexpected payment status: ${paymentIntent.status}`);
            }
        } catch (err) {
            onError(err.message || 'Payment processing failed');
            setProcessing(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
                <label style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: '600',
                    fontSize: '0.95rem',
                    color: darkMode ? '#e0e0e0' : '#333'
                }}>
                    Card Details *
                </label>
                <div style={{
                    padding: '0.75rem 1rem',
                    border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                    borderRadius: '6px',
                    backgroundColor: darkMode ? '#1a1a1a' : '#fff'
                }}>
                    <CardElement
                        options={{
                            style: {
                                base: {
                                    fontSize: '16px',
                                    color: darkMode ? '#e0e0e0' : '#333',
                                    '::placeholder': {
                                        color: darkMode ? '#999' : '#aaa'
                                    },
                                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                                },
                                invalid: {
                                    color: '#dc3545',
                                    iconColor: '#dc3545'
                                }
                            }
                        }}
                    />
                </div>
                <p style={{
                    fontSize: '0.75rem',
                    color: darkMode ? '#999' : '#666',
                    marginTop: '0.5rem',
                    lineHeight: '1.3'
                }}>
                    💳 Your card will be authorized but not charged until your ad is approved.
                </p>
            </div>

            <button
                type="submit"
                disabled={!stripe || processing}
                style={{
                    width: '100%',
                    padding: '0.75rem',
                    fontSize: '1rem',
                    fontWeight: '600',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: processing ? '#999' : '#0b63a4',
                    color: '#fff',
                    cursor: processing ? 'not-allowed' : 'pointer',
                    opacity: processing ? 0.6 : 1,
                    transition: 'background-color 0.2s ease'
                }}
                onMouseEnter={(e) => {
                    if (!processing && stripe) {
                        e.target.style.backgroundColor = '#094d7f';
                    }
                }}
                onMouseLeave={(e) => {
                    if (!processing) {
                        e.target.style.backgroundColor = '#0b63a4';
                    }
                }}
            >
                {processing ? 'Processing Payment...' : `Submit Ad & Authorize $${AD_PRICING[adFormData.duration]} Payment`}
            </button>
        </form>
    );
}

function useQuery() {
    return new URLSearchParams(useLocation().search);
}

export default function MainApp() {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const [mapStyleLoaded, setMapStyleLoaded] = useState(false);
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);

    const [mapExpanded, setMapExpanded] = useState(false);
    const [mapOptionsOpen, setMapOptionsOpen] = useState(false);
    const [selectedMapStyle, setSelectedMapStyle] = useState(() => {
        const savedStyle = localStorage.getItem('mapVisualizationStyle');
        return savedStyle || "choropleth";
    });

    const [aboutText, setAboutText] = useState('');
    const [darkMode, setDarkMode] = useState(() => {
        const savedMode = localStorage.getItem('darkMode');
        return savedMode === 'true';
    });

    const [aboutModalOpen, setAboutModalOpen] = useState(false);
    const [adSubmissionOpen, setAdSubmissionOpen] = useState(false);
    const [adFormData, setAdFormData] = useState({
        companyName: '',
        adText: '',
        linkUrl: '',
        email: '',
        duration: 7,
        startDate: '',
        imageFile: null,
        imagePreview: null
    });
    const [adFormErrors, setAdFormErrors] = useState({});
    const [adFormSubmitting, setAdFormSubmitting] = useState(false);

    const [liveAds, setLiveAds] = useState([]);
    const [homebaseName, setHomebaseName] = useState("Loading...");

    const [authMode, setAuthMode] = useState("login");
    const [signUpEmail, setSignUpEmail] = useState("");
    const [signUpPassword, setSignUpPassword] = useState("");
    const [loginEmail, setLoginEmail] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
    const [resetEmail, setResetEmail] = useState("");
    const [resetEmailSent, setResetEmailSent] = useState(false);

    const [topics, setTopics] = useState([]);
    const [heatPoints, setHeatPoints] = useState([]);
    const [twinklePoints, setTwinklePoints] = useState([]);
    const [selectedTopic, setSelectedTopic] = useState(null);
    const [reportModalOpen, setReportModalOpen] = useState(false);
    const [reportReason, setReportReason] = useState('');
    const [topicHasReport, setTopicHasReport] = useState(false);
    const [topicReportStatus, setTopicReportStatus] = useState(null);

    const [hasFilteredWords, setHasFilteredWords] = useState(false);

    const [createOpen, setCreateOpen] = useState(false);
    const [selectedPresetTitle, setSelectedPresetTitle] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [stance, setStance] = useState("");

    const [engageStance, setEngageStance] = useState("");

    const [searchText, setSearchText] = useState("");
    const [filterTitle, setFilterTitle] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [filterOpen, setFilterOpen] = useState(false);

    const [sortOption, setSortOption] = useState("newest");

    const [userSpotlightOpen, setUserSpotlightOpen] = useState(false);
    const [userHistory, setUserHistory] = useState([]);
    const [selectedUserPoint, setSelectedUserPoint] = useState(null);

    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const feedRef = useRef();

    const query = useQuery();
    const topicIdFromURL = query.get("topic");
    const location = useLocation();

    const [useMapView, setUseMapView] = useState(true);
    const [visibleBounds, setVisibleBounds] = useState(null);
    const [useGlobe, setUseGlobe] = useState(() => {
        const savedGlobe = localStorage.getItem('useGlobe');
        return savedGlobe === 'true';
    });

    // GEO FILTER state (add this with your other useState declarations, before the return)
    const GEO_FILTERS = {
        GLOBAL: 'global',
        WITHIN_10KM: 'within_10km',
        WITHIN_100KM: 'within_100km'
    };
    const [geoFilter, setGeoFilter] = useState(GEO_FILTERS.GLOBAL);
    const [visibleTopics, setVisibleTopics] = useState([]); // optional now or later

    const handleAdFormChange = (field, value) => {
        setAdFormData(prev => ({
            ...prev,
            [field]: value
        }));
        if (adFormErrors[field]) {
            setAdFormErrors(prev => ({
                ...prev,
                [field]: null
            }));
        }
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            await validateImage(file);
            const previewUrl = URL.createObjectURL(file);
            setAdFormData(prev => ({
                ...prev,
                imageFile: file,
                imagePreview: previewUrl
            }));
            setAdFormErrors(prev => ({
                ...prev,
                image: null
            }));
        } catch (error) {
            setAdFormErrors(prev => ({
                ...prev,
                image: error
            }));
            e.target.value = '';
        }
    };

    const validateAdForm = () => {
        const errors = {};
        if (!adFormData.companyName.trim()) {
            errors.companyName = 'Company name is required';
        }
        if (!adFormData.adText.trim()) {
            errors.adText = 'Ad text is required';
        } else if (adFormData.adText.length > 100) {
            errors.adText = 'Ad text must be 100 characters or less';
        }
        if (!adFormData.linkUrl.trim()) {
            errors.linkUrl = 'Link URL is required';
        } else {
            try {
                new URL(adFormData.linkUrl.startsWith('http') ? adFormData.linkUrl : `https://${adFormData.linkUrl}`);
            } catch {
                errors.linkUrl = 'Please enter a valid URL';
            }
        }
        if (!adFormData.email.trim()) {
            errors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adFormData.email)) {
            errors.email = 'Please enter a valid email';
        }
        if (!adFormData.imageFile) {
            errors.image = 'Ad image is required';
        }
        if (!adFormData.startDate) {
            errors.startDate = 'Start date is required';
        } else {
            const selectedDate = new Date(adFormData.startDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (selectedDate < today) {
                errors.startDate = 'Start date cannot be in the past';
            }
        }
        setAdFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleAdSubmit = async (paymentIntentId) => {
        setAdFormSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('companyName', adFormData.companyName);
            formData.append('adText', adFormData.adText);
            formData.append('linkUrl', adFormData.linkUrl);
            formData.append('email', adFormData.email);
            formData.append('duration', adFormData.duration);
            formData.append('amount', AD_PRICING[adFormData.duration]);
            formData.append('image', adFormData.imageFile);
            formData.append('startDate', adFormData.startDate);
            formData.append('paymentIntentId', paymentIntentId);

            const response = await fetch(`${API_BASE}/api/ad-submissions`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to submit ad: ${errorText}`);
            }

            const result = await response.json();
            alert(`Thank you! Your ad submission has been received. We'll review it and contact you at ${adFormData.email} within 24 hours.\n\nSubmission ID: ${result.id}`);

            setAdFormData({
                companyName: '',
                adText: '',
                linkUrl: '',
                email: '',
                duration: 7,
                startDate: '',
                imageFile: null,
                imagePreview: null
            });
            setAdFormErrors({});
            setAdSubmissionOpen(false);
            setAboutModalOpen(false);
        } catch (error) {
            alert(`Failed to submit ad: ${error.message}\n\nPlease try again or contact us at ads@pulsevote.org`);
        } finally {
            setAdFormSubmitting(false);
        }
    };

    const resetAdForm = () => {
        setAdFormData({
            companyName: '',
            adText: '',
            linkUrl: '',
            email: '',
            duration: 7,
            startDate: '',
            imageFile: null,
            imagePreview: null
        });
        setAdFormErrors({});
        setAdSubmissionOpen(false);
    };

    async function fetchProfile(userId) {
        const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .single();

        if (error) {
            console.error("Error fetching profile:", error);
            return;
        }

        if (data) {
            setProfile(data);
            if (data.homebase_set && data.home_lat && data.home_lng) {
                setHomebaseName("Loading...");
                const locationName = await getLocationName(data.home_lat, data.home_lng);
                setHomebaseName(locationName);
            } else {
                setHomebaseName("Not Set");
            }
        }
    }

    async function getLocationName(lat, lng) {
        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
                {
                    headers: {
                        'User-Agent': 'PulseVote-App'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (data && data.address) {
                const city = data.address.city || data.address.town || data.address.village || data.address.suburb;
                const country = data.address.country;
                if (city && country) {
                    return `${city}, ${country}`;
                } else if (country) {
                    return country;
                }
            }
            return "Unknown Location";
        } catch (error) {
            console.error("Error fetching location name:", error);
            return "Location Unavailable";
        }
    }

    async function fetchUserHistory() {
        if (!user?.id) {
            setUserHistory([]);
            return;
        }

        const { data, error } = await supabase
            .from("points")
            .select("id, stance, intensity, created_at, topics(id)")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Error fetching history:", error);
            setUserHistory([]);
            return;
        }

        const rows = data.map(({ topics, ...p }) => ({ ...p, topic: topics }));
        setUserHistory(rows);
    }

    const toggleUserSpotlight = () => {
        setUserSpotlightOpen(open => {
            const next = !open;
            if (next) {
                fetchUserHistory();
                setSelectedTopic(null);
                setSelectedUserPoint(null);
            }
            return next;
        });
    };

    const closeUserSpotlight = () => {
        setUserSpotlightOpen(false);
        setSelectedUserPoint(null);
    };

    const handleShare = topicId => {
        const shareUrl = `${window.location.origin}/?topic=${topicId}`;
        if (navigator.share) {
            navigator.share({
                title: "Check out this topic on PulseVote",
                url: shareUrl
            });
        } else {
            navigator.clipboard.writeText(shareUrl)
                .then(() => alert("Link copied to clipboard!"))
                .catch(() => alert("Failed to copy link."));
        }
    };

    const handleSignUp = async e => {
        e.preventDefault();
        const { error } = await supabase.auth.signUp({ email: signUpEmail, password: signUpPassword });
        if (error) return alert("Sign up failed: " + error.message);
        alert("Check your email to confirm sign up.");
    };

    const handleLogin = async e => {
        e.preventDefault();
        const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
        if (error) return alert("Login failed: " + error.message);
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        if (!resetEmail.trim()) {
            return alert("Please enter your email address.");
        }

        const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
            redirectTo: `${window.location.origin}/reset-password`,
        });

        if (error) {
            alert("Error sending reset email: " + error.message);
        } else {
            setResetEmailSent(true);
            alert(`Password reset link sent to ${resetEmail}. Please check your email.`);
            setTimeout(() => {
                setResetEmail("");
                setResetEmailSent(false);
                setForgotPasswordOpen(false);
            }, 3000);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
    };

    const handleOAuthSignIn = async (provider) => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: provider,
            options: {
                redirectTo: window.location.origin
            }
        });

        if (error) {
            console.error(`${provider} sign-in error:`, error);
            alert(`Failed to sign in with ${provider}: ${error.message}`);
        }
    };

    const setHomebase = () => {
        if (!user) return alert("Please sign in.");
        if (profile?.homebase_set) return alert("Homebase already set.");
        if (!navigator.geolocation) return alert("Geolocation not available.");

        const confirmed = window.confirm(
            "⚠️ PRIVACY & SAFETY REMINDER\n\n" +
            "Think carefully about where you set your homebase.\n\n" +
            "For your safety, it's recommended to set your homebase at a public space NEAR your home (like a park, library, coffee shop, or gas station) instead of your actual home address.\n\n" +
            "This helps protect your privacy while still representing your local area.\n\n" +
            "Click OK to proceed and allow location access, or Cancel to abort."
        );

        if (!confirmed) {
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async pos => {
                const { latitude, longitude } = pos.coords;
                const now = new Date().toISOString();

                const { data, error } = await supabase
                    .from("profiles")
                    .upsert({
                        id: user.id,
                        home_lat: latitude,
                        home_lng: longitude,
                        homebase_set: true,
                        homebase_last_reset: now,
                    })
                    .select();

                if (error) {
                    console.error("Error setting homebase:", error);
                    alert("Failed to set homebase: " + error.message);
                } else {
                    fetchProfile(user.id);
                    alert("✅ Homebase set successfully!");
                }
            },
            (error) => {
                console.error("Geolocation error:", error);
                alert("Failed to get location. Please allow location access and try again.");
            },
            { enableHighAccuracy: true }
        );
    };

    const resetHomebase = async () => {
        if (!user) return alert("Please sign in.");
        if (!profile?.homebase_set) return alert("No homebase to reset.");
        if (!navigator.geolocation) return alert("Geolocation not available.");

        const confirmReset = window.confirm(
            "Are you sure you want to reset your homebase? This can only be done once every 180 days."
        );
        if (!confirmReset) return;

        navigator.geolocation.getCurrentPosition(
            async pos => {
                const { latitude, longitude } = pos.coords;
                const res = await fetch(`${API_BASE}/profiles/${user.id}/reset-homebase`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lat: latitude, lng: longitude }),
                });

                const data = await res.json();
                if (!res.ok) {
                    if (res.status === 429) {
                        return alert(data.message || "You can only reset homebase once every 180 days.");
                    }
                    return alert(data.error || "Failed to reset homebase.");
                }

                await fetchProfile(user.id);
                alert("Homebase reset successfully!");
            },
            () => alert("Allow location access and try again."),
            { enableHighAccuracy: true }
        );
    };

    const handleCreateTopic = async e => {
        e.preventDefault();
        if (!user) return alert("Sign in first.");
        if (!newDescription.trim()) return alert("Description required.");
        if (!stance) return alert("Select a stance.");
        if (!profile?.homebase_set) return alert("Set homebase first.");
        if (!selectedPresetTitle || selectedPresetTitle === "") return alert("Select a topic.");

        const payload = {
            title: selectedPresetTitle,
            description: newDescription.trim(),
            stance,
            created_by: user.id,
            lat: profile.home_lat,
            lng: profile.home_lng,
            intensity: 35,
        };

        const res = await fetch(`${API_BASE}/topics`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) {
            console.error("Create topic failed:", data);
            if (res.status === 429) {
                return alert(data.message || "You can only create one topic per day. Please try again later.");
            }
            return alert(data.error || "Could not create topic.");
        }

        await fetch(`${API_BASE}/points`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                topic_id: data.id,
                user_id: user.id,
                stance,
                intensity: 35,
                lat: profile.home_lat,
                lng: profile.home_lng,
            }),
        });

        setTopics(prev => (prev.some(t => t.id === data.id) ? prev : [data, ...prev]));
        setNewDescription("");
        setStance("");
        setSelectedPresetTitle("<< Select >>");
        setCreateOpen(false);
        alert("Topic created successfully!");
    };

    const handleEngage = async e => {
        e.preventDefault();
        if (!user?.id || !profile?.homebase_set) {
            return alert("Log in and set your homebase first.");
        }
        if (!selectedTopic?.id || !engageStance) {
            return alert("Select a topic and your stance.");
        }

        const res = await fetch(`${API_BASE}/points`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                topic_id: selectedTopic.id,
                user_id: user.id,
                stance: engageStance,
                intensity: 35,
                lat: profile.home_lat,
                lng: profile.home_lng,
            }),
        });

        const pt = await res.json();
        if (res.ok) {
            setHeatPoints(prev => mergeMostRecentPerUser(prev, [pt]));
        }
        setEngageStance("");
    };

    const handleSelectTopic = async t => {
        setSelectedTopic(t);
        setHeatPoints([]);
        try {
            const res = await fetch(`${API_BASE}/points?topic_id=${encodeURIComponent(t.id)}`);
            if (res.ok) {
                setHeatPoints(await res.json());
            }
        } catch (err) {
            console.error("Error loading topic points:", err);
        }
    };

    const closeSpotlight = () => {
        setSelectedTopic(null);
        setHeatPoints([]);
        setEngageStance("");
    };

    const PAGE_SIZE = 20;
    const loadNextPage = async () => {
        if (!hasMore) return;
        try {
            const res = await fetch(`${API_BASE}/topics?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
            const rows = await res.json();
            setTopics(prev => {
                const ids = new Set(prev.map(t => t.id));
                const filtered = rows.filter(r => !ids.has(r.id));
                return [...prev, ...filtered];
            });
            setHasMore(rows.length === PAGE_SIZE);
            setPage(p => p + 1);
        } catch (err) {
            console.error("Error loading topics:", err);
        }
    };

    // Initialize MapLibre map
    useEffect(() => {
        if (mapRef.current || !mapContainerRef.current) return;

        const map = new maplibregl.Map({
            container: mapContainerRef.current,
            style: {
                version: 8,
                sources: {
                    'osm': {
                        type: 'raster',
                        tiles: darkMode
                            ? ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png']
                            : ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                        tileSize: 256,
                        attribution: darkMode
                            ? '© OpenStreetMap contributors © CARTO'
                            : '© OpenStreetMap contributors'
                    }
                },
                layers: [
                    {
                        id: 'osm-tiles',
                        type: 'raster',
                        source: 'osm',
                        minzoom: 0,
                        maxzoom: 19
                    }
                ],
                projection: {
                    type: 'mercator'  // Start with mercator, will toggle to globe
                }
            },
            center: [0, 20],
            zoom: 2.6,
            minZoom: 1,
            maxZoom: 12
        });

        map.on('load', () => {
            mapRef.current = map;
            setMapStyleLoaded(true);

            const updateBounds = () => {
                const bounds = map.getBounds();
                setVisibleBounds({
                    getSouthWest: () => ({ lat: bounds.getSouth(), lng: bounds.getWest() }),
                    getNorthEast: () => ({ lat: bounds.getNorth(), lng: bounds.getEast() })
                });
            };

            map.on('moveend', updateBounds);
            updateBounds();
        });

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []);


    // Toggle between 2D and 3D globe
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapStyleLoaded) return;

        if (useGlobe) {
            map.setProjection({
                type: 'globe'
            });

            // Add globe mode class for styling
            document.body.classList.add('globe-mode');

            // Optional: Add atmosphere effect for better visuals
            map.setPaintProperty('osm-tiles', 'raster-opacity', 1);

            // Auto-zoom out when enabling globe for best view
            if (map.getZoom() > 4) {
                map.flyTo({ zoom: 2, duration: 1000 });
            }
        } else {
            map.setProjection({
                type: 'mercator'
            });

            // Remove globe mode class
            document.body.classList.remove('globe-mode');
        }

        // Cleanup on unmount
        return () => {
            document.body.classList.remove('globe-mode');
        };
    }, [useGlobe, mapStyleLoaded]);

    // Auto-rotate globe on initial load
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapStyleLoaded || !useGlobe) return;

        let rotationAnimation = null;
        let userHasInteracted = false;

        // Gentle rotation speed (degrees per frame)
        const rotationSpeed = 0.05;

        const rotateCamera = (timestamp) => {
            if (userHasInteracted) return;

            // Rotate the globe by adjusting the center longitude
            const center = map.getCenter();
            map.setCenter([center.lng - rotationSpeed, center.lat]);

            // Continue the animation
            rotationAnimation = requestAnimationFrame(rotateCamera);
        };

        // Start rotation after a short delay to let the map settle
        const startDelay = setTimeout(() => {
            rotationAnimation = requestAnimationFrame(rotateCamera);
        }, 500);

        // Stop rotation on any user interaction
        const stopRotation = () => {
            userHasInteracted = true;
            if (rotationAnimation) {
                cancelAnimationFrame(rotationAnimation);
                rotationAnimation = null;
            }
        };

        // Listen for user interactions
        map.once('mousedown', stopRotation);
        map.once('touchstart', stopRotation);
        map.once('wheel', stopRotation);
        map.once('dragstart', stopRotation);

        // Cleanup
        return () => {
            clearTimeout(startDelay);
            if (rotationAnimation) {
                cancelAnimationFrame(rotationAnimation);
            }
            map.off('mousedown', stopRotation);
            map.off('touchstart', stopRotation);
            map.off('wheel', stopRotation);
            map.off('dragstart', stopRotation);
        };
    }, [useGlobe, mapStyleLoaded]);

    // Update map style when dark mode changes
    useEffect(() => {
        if (!mapRef.current) return;

        const map = mapRef.current;

        // Store current center and zoom before style change
        const center = map.getCenter();
        const zoom = map.getZoom();

        const newStyle = {
            version: 8,
            sources: {
                'osm': {
                    type: 'raster',
                    tiles: darkMode
                        ? ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png']
                        : ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                    tileSize: 256
                }
            },
            layers: [
                {
                    id: 'osm-tiles',
                    type: 'raster',
                    source: 'osm'
                }
            ]
        };

        map.setStyle(newStyle);

        // Wait for style to load, then restore position and trigger state update
        map.once('styledata', () => {
            map.setCenter(center);
            map.setZoom(zoom);

            // Update visible bounds to trigger stats recalculation
            const bounds = map.getBounds();
            setVisibleBounds({
                getSouthWest: () => ({ lat: bounds.getSouth(), lng: bounds.getWest() }),
                getNorthEast: () => ({ lat: bounds.getNorth(), lng: bounds.getEast() })
            });

            // Force re-render by toggling state
            setMapStyleLoaded(false);
            setTimeout(() => {
                setMapStyleLoaded(true);
                // Trigger moveend after a short delay to ensure layers are ready
                setTimeout(() => map.fire('moveend'), 50);
            }, 0);
        });
    }, [darkMode]);

    // Twinkle points (ambient visualization)
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapStyleLoaded || twinklePoints.length === 0) return;

        // Only show twinkle points when NO topic is selected
        if (selectedTopic) {
            return;
        }

        let animationId = null;

        const renderTwinklePoints = () => {
            if (!map.isStyleLoaded()) {
                // Wait for style to load
                setTimeout(renderTwinklePoints, 100);
                return;
            }

            // Clean up existing layer/source first
            const sourceId = 'twinkle-points';
            const layerId = 'twinkle-layer';

            try {
                if (map.getLayer(layerId)) {
                    map.removeLayer(layerId);
                }
                if (map.getSource(sourceId)) {
                    map.removeSource(sourceId);
                }
            } catch (e) {
                // Ignore errors during cleanup
            }

            const features = twinklePoints.map((p) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [Number(p.lng), Number(p.lat)]
                },
                properties: {
                    color: STANCE_COLOR[p.stance] || '#888',
                    randomOffset: Math.random() * Math.PI * 2
                }
            }));

            const geojson = {
                type: 'FeatureCollection',
                features
            };

            map.addSource(sourceId, {
                type: 'geojson',
                data: geojson
            });

            map.addLayer({
                id: layerId,
                type: 'circle',
                source: sourceId,
                paint: {
                    'circle-radius': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        2, 6,      // At zoom 2, radius is 3px
                        12, 16      // At zoom 12, radius is 8px
                    ],
                    'circle-color': ['get', 'color'],
                    'circle-opacity': 0.6,
                    'circle-blur': 0.5
                }
            });

            // Start animation
            let time = 0;
            const animate = () => {
                time += 0.04;  // ← This controls pulse speed (higher = faster)

                const opacity = [
                    'interpolate',
                    ['linear'],
                    [
                        '+',
                        [
                            'sin',
                            [
                                '+',
                                time,
                                ['get', 'randomOffset']
                            ]
                        ],
                        1
                    ],
                    0, 0.0,    // Minimum opacity
                    1, 0.5,    // Mid opacity
                    2, 1.0     // Maximum opacity
                ];

                try {
                    if (map.getLayer(layerId)) {
                        map.setPaintProperty(layerId, 'circle-opacity', opacity);
                        animationId = requestAnimationFrame(animate);
                    }
                } catch (e) {
                    // Layer was removed, stop animation
                    if (animationId) {
                        cancelAnimationFrame(animationId);
                    }
                }
            };

            animate();
        };

        renderTwinklePoints();

        // Cleanup
        return () => {
            if (animationId) {
                cancelAnimationFrame(animationId);
            }
            const layerId = 'twinkle-layer';
            const sourceId = 'twinkle-points';
            try {
                if (map.getLayer(layerId)) {
                    map.removeLayer(layerId);
                }
                if (map.getSource(sourceId)) {
                    map.removeSource(sourceId);
                }
            } catch (e) {
                // Ignore cleanup errors
            }
        };
    }, [mapStyleLoaded, selectedTopic, twinklePoints]);

    // Update point map visualization
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapStyleLoaded || !selectedTopic || heatPoints.length === 0) return;
        if (selectedMapStyle !== 'heatmap') return;

        function updatePointMap(map, points) {
            if (!map.isStyleLoaded()) return;

            const sourceId = 'pointmap-combined';
            const layerId = 'pointmap-layer-combined';

            // Remove old layers if they exist
            const oldLayers = ["-No", "No", "Neutral", "Yes", "Yes+"].map(s => `pointmap-layer-${s}`);
            oldLayers.forEach(layer => {
                if (map.getLayer(layer)) map.removeLayer(layer);
            });
            const oldSources = ["-No", "No", "Neutral", "Yes", "Yes+"].map(s => `pointmap-${s}`);
            oldSources.forEach(source => {
                if (map.getSource(source)) map.removeSource(source);
            });

            // Create a single GeoJSON with all points, colored by stance
            const features = points.map(p => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [Number(p.lng), Number(p.lat)]
                },
                properties: {
                    stance: p.stance,
                    color: STANCE_COLOR[p.stance] || '#888'
                }
            }));

            const geojson = {
                type: 'FeatureCollection',
                features
            };

            if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
            }
            if (map.getSource(sourceId)) {
                map.removeSource(sourceId);
            }

            map.addSource(sourceId, {
                type: 'geojson',
                data: geojson
            });

            map.addLayer({
                id: layerId,
                type: 'circle',
                source: sourceId,
                paint: {
                    'circle-radius': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        2, 3,      // Small when zoomed out
                        6, 5,
                        12, 10     // Larger when zoomed in
                    ],
                    'circle-color': ['get', 'color'],  // Get color from feature properties
                    'circle-opacity': 0.65,    // Semi-transparent for blending
                    'circle-blur': 0.3,        // Slight blur for smoother color mixing
                    'circle-stroke-width': 0.5,
                    'circle-stroke-color': '#fff',
                    'circle-stroke-opacity': 0.4
                }
            });
        }

        updatePointMap(map, heatPoints);

        return () => {
            const layerId = 'pointmap-layer-combined';
            const sourceId = 'pointmap-combined';

            // Also clean up old separate layers
            const oldLayers = ["-No", "No", "Neutral", "Yes", "Yes+"].map(s => `pointmap-layer-${s}`);
            oldLayers.forEach(layer => {
                if (map.getLayer(layer)) map.removeLayer(layer);
            });
            const oldSources = ["-No", "No", "Neutral", "Yes", "Yes+"].map(s => `pointmap-${s}`);
            oldSources.forEach(source => {
                if (map.getSource(source)) map.removeSource(source);
            });

            if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
            }
            if (map.getSource(sourceId)) {
                map.removeSource(sourceId);
            }
        };
    }, [heatPoints, selectedTopic, selectedMapStyle, mapStyleLoaded]);

    // Update choropleth visualization
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapStyleLoaded || !selectedTopic || heatPoints.length === 0) return;
        if (selectedMapStyle !== 'choropleth') return;

        function getGridSizeForZoom(zoom) {
            if (zoom <= 2) return 6;
            if (zoom <= 3) return 4;
            if (zoom <= 4) return 3;
            if (zoom <= 5) return 2;
            if (zoom <= 6) return 1;
            if (zoom <= 7) return 0.5;
            if (zoom <= 8) return 0.3;
            if (zoom <= 9) return 0.16;
            if (zoom <= 10) return 0.08;
            if (zoom <= 11) return 0.02;
            return 0.01;
        }

        function updateChoropleth(map) {
            if (!map.isStyleLoaded()) return;

            const bounds = map.getBounds();
            const gridSize = getGridSizeForZoom(map.getZoom());

            const features = [];
            const latMin = bounds.getSouth();
            const latMax = bounds.getNorth();
            const lngMin = bounds.getWest();
            const lngMax = bounds.getEast();

            for (let lat = latMin; lat < latMax; lat += gridSize) {
                for (let lng = lngMin; lng < lngMax; lng += gridSize) {
                    const cellLatMax = Math.min(lat + gridSize, latMax);
                    const cellLngMax = Math.min(lng + gridSize, lngMax);

                    const pointsInCell = heatPoints.filter(p =>
                        p.lat >= lat && p.lat < cellLatMax &&
                        p.lng >= lng && p.lng < cellLngMax
                    );

                    if (pointsInCell.length === 0) continue;

                    const totalScore = pointsInCell.reduce((sum, p) => {
                        return sum + (stanceWeights[p.stance] ?? 0);
                    }, 0);
                    const avg = totalScore / pointsInCell.length;

                    let color;
                    if (avg < -1) color = STANCE_COLOR["-No"];
                    else if (avg < -0.1) color = STANCE_COLOR["No"];
                    else if (avg < 0.1) color = STANCE_COLOR["Neutral"];
                    else if (avg <= 1.00) color = STANCE_COLOR["Yes"];
                    else color = STANCE_COLOR["Yes+"];

                    features.push({
                        type: 'Feature',
                        properties: { avg, color },
                        geometry: {
                            type: 'Polygon',
                            coordinates: [[
                                [lng, lat],
                                [cellLngMax, lat],
                                [cellLngMax, cellLatMax],
                                [lng, cellLatMax],
                                [lng, lat]
                            ]]
                        }
                    });
                }
            }

            const geojson = {
                type: 'FeatureCollection',
                features
            };

            const sourceId = 'choropleth-grid';
            const layerId = 'choropleth-layer';

            if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
            }
            if (map.getSource(sourceId)) {
                map.removeSource(sourceId);
            }

            if (features.length > 0) {
                map.addSource(sourceId, {
                    type: 'geojson',
                    data: geojson
                });

                map.addLayer({
                    id: layerId,
                    type: 'fill',
                    source: sourceId,
                    paint: {
                        'fill-color': ['get', 'color'],
                        'fill-opacity': 0.6,
                        'fill-outline-color': '#666'
                    }
                });

                // Add click handler for popups
                map.on('click', layerId, (e) => {
                    if (e.features.length > 0) {
                        const avg = e.features[0].properties.avg;

                        new maplibregl.Popup()
                            .setLngLat(e.lngLat)
                            .setHTML(`
                            <div style="
                                text-align: center; 
                                padding: 12px;
                                background: ${darkMode ? '#2d2d2d' : '#fff'};
                                color: ${darkMode ? '#e0e0e0' : '#333'};
                                border-radius: 6px;
                                min-width: 120px;
                            ">
                                <strong style="font-size: 1.1rem;">Average Score</strong><br/>
                                <span style="font-size: 1.5rem; font-weight: bold; color: #0b63a4;">
                                    ${parseFloat(avg).toFixed(2)}
                                </span>
                            </div>
                        `)
                            .addTo(map);
                    }
                });

                // Change cursor on hover
                map.on('mouseenter', layerId, () => {
                    map.getCanvas().style.cursor = 'pointer';
                });

                map.on('mouseleave', layerId, () => {
                    map.getCanvas().style.cursor = '';
                });
            }
        }

        const handleMoveEnd = () => {
            // Don't recalculate during globe rotation - only when user manually moves/zooms
            if (!useGlobe) {
                updateChoropleth(map);
            }
        };

        const handleZoomEnd = () => {
            // Always recalculate on zoom (both 2D and 3D) to adjust grid size
            updateChoropleth(map);
        };

        // Initial calculation
        updateChoropleth(map);

        // Listen to zoom in both modes, but moveend only in 2D mode
        map.on('zoomend', handleZoomEnd);
        if (!useGlobe) {
            map.on('moveend', handleMoveEnd);
        }

        return () => {
            map.off('zoomend', handleZoomEnd);
            map.off('moveend', handleMoveEnd);
            const layerId = 'choropleth-layer';
            const sourceId = 'choropleth-grid';

            // Remove event listeners
            map.off('click', layerId);
            map.off('mouseenter', layerId);
            map.off('mouseleave', layerId);

            if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
            }
            if (map.getSource(sourceId)) {
                map.removeSource(sourceId);
            }
        };
    }, [heatPoints, selectedTopic, selectedMapStyle, mapStyleLoaded, darkMode]);

    // Custom choropleth (loads GeoJSON file)
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapStyleLoaded || !selectedTopic || heatPoints.length === 0) return;
        if (selectedMapStyle !== 'custom-choropleth') return;

        async function loadCustomChoropleth() {
            try {
                const paths = [
                    '/custom.geo.json',
                    '/custom.geo',
                    `${process.env.PUBLIC_URL}/custom.geo.json`,
                    `${process.env.PUBLIC_URL}/custom.geo`
                ];

                let geoJSONData = null;
                for (const path of paths) {
                    try {
                        const response = await fetch(path);
                        if (response.ok) {
                            geoJSONData = await response.json();
                            break;
                        }
                    } catch (err) {
                        continue;
                    }
                }

                if (!geoJSONData) {
                    console.error('Could not load custom GeoJSON');
                    return;
                }

                if (!map.isStyleLoaded()) {
                    return;
                }

                renderCustomChoropleth(map, geoJSONData);

            } catch (error) {
                console.error('Error loading custom GeoJSON:', error);
            }
        }

        function renderCustomChoropleth(map, geoJSONData) {
            const sourceId = 'custom-choropleth';
            const layerId = 'custom-choropleth-layer';

            if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
            }
            if (map.getSource(sourceId)) {
                map.removeSource(sourceId);
            }

            const featuresWithColors = geoJSONData.features.map(feature => {
                const avg = calculateAvgForFeature(feature);
                let color = 'rgba(0,0,0,0)';

                if (avg !== null) {
                    if (avg < -1) color = STANCE_COLOR["-No"];
                    else if (avg < -0.1) color = STANCE_COLOR["No"];
                    else if (avg < 0.1) color = STANCE_COLOR["Neutral"];
                    else if (avg <= 1.00) color = STANCE_COLOR["Yes"];
                    else color = STANCE_COLOR["Yes+"];
                }

                return {
                    ...feature,
                    properties: {
                        ...feature.properties,
                        avg: avg,
                        color: color
                    }
                };
            });

            const coloredGeoJSON = {
                ...geoJSONData,
                features: featuresWithColors
            };

            map.addSource(sourceId, {
                type: 'geojson',
                data: coloredGeoJSON
            });

            map.addLayer({
                id: layerId,
                type: 'fill',
                source: sourceId,
                paint: {
                    'fill-color': ['get', 'color'],
                    'fill-opacity': 0.6,
                    'fill-outline-color': '#666'
                }
            });

            // Add click handler for popups
            map.on('click', layerId, (e) => {
                if (e.features.length > 0) {
                    const feature = e.features[0];
                    const name = feature.properties.name || feature.properties.NAME || 'Region';
                    const avg = feature.properties.avg;

                    new maplibregl.Popup()
                        .setLngLat(e.lngLat)
                        .setHTML(`
                        <div style="
                            text-align: center; 
                            padding: 12px;
                            background: ${darkMode ? '#2d2d2d' : '#fff'};
                            color: ${darkMode ? '#e0e0e0' : '#333'};
                            border-radius: 6px;
                            min-width: 150px;
                        ">
                            <strong style="font-size: 1.1rem;">${name}</strong><br/>
                            <span style="font-size: 1.3rem; font-weight: bold; color: #0b63a4;">
                                ${avg !== null ? parseFloat(avg).toFixed(2) : 'No data'}
                            </span>
                            ${avg !== null ? '<div style="font-size: 0.85rem; color: #666; margin-top: 4px;">Average Score</div>' : ''}
                        </div>
                    `)
                        .addTo(map);
                }
            });

            // Change cursor on hover
            map.on('mouseenter', layerId, () => {
                map.getCanvas().style.cursor = 'pointer';
            });

            map.on('mouseleave', layerId, () => {
                map.getCanvas().style.cursor = '';
            });
        }

        function calculateAvgForFeature(feature) {
            if (!feature.geometry) return null;

            const pointInPolygon = (lat, lng, coords) => {
                let inside = false;
                const x = lng;
                const y = lat;

                for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
                    const xi = coords[i][0];
                    const yi = coords[i][1];
                    const xj = coords[j][0];
                    const yj = coords[j][1];

                    const intersect = ((yi > y) !== (yj > y)) &&
                        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                    if (intersect) inside = !inside;
                }
                return inside;
            };

            let pointsInFeature = [];

            if (feature.geometry.type === 'Polygon') {
                const coords = feature.geometry.coordinates[0];
                pointsInFeature = heatPoints.filter(p =>
                    pointInPolygon(p.lat, p.lng, coords)
                );
            } else if (feature.geometry.type === 'MultiPolygon') {
                pointsInFeature = heatPoints.filter(p => {
                    return feature.geometry.coordinates.some(polygon => {
                        return pointInPolygon(p.lat, p.lng, polygon[0]);
                    });
                });
            }

            if (pointsInFeature.length === 0) return null;

            const totalScore = pointsInFeature.reduce((sum, p) => {
                const weight = stanceWeights[p.stance] ?? 0;
                return sum + weight;
            }, 0);

            return totalScore / pointsInFeature.length;
        }

        loadCustomChoropleth();

        return () => {
            const layerId = 'custom-choropleth-layer';
            const sourceId = 'custom-choropleth';

            // Remove event listeners
            map.off('click', layerId);
            map.off('mouseenter', layerId);
            map.off('mouseleave', layerId);

            if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
            }
            if (map.getSource(sourceId)) {
                map.removeSource(sourceId);
            }
        };
    }, [heatPoints, selectedTopic, selectedMapStyle, mapStyleLoaded, darkMode]);

    // Fetch twinkle points on initial load
    useEffect(() => {
        console.log('📡 Fetching twinkle points...');
        (async () => {
            try {
                const res = await fetch(`${API_BASE}/twinkle_points`);
                if (res.ok) {
                    const rows = await res.json();
                    console.log('✅ Fetched twinkle points:', rows.length);
                    setTwinklePoints(rows);
                } else {
                    console.error('❌ Failed to fetch twinkle points');
                }
            } catch (err) {
                console.error("Error fetching twinkle points:", err);
            }
        })();
    }, []);


    useEffect(() => {
        async function loadSharedTopic() {
            const params = new URLSearchParams(location.search);
            const topicId = params.get("topic");
            if (!topicId) return;

            try {
                const existing = topics.find(t => String(t.id) === String(topicId));
                if (existing) {
                    setSelectedTopic(existing);
                    const res = await fetch(`${API_BASE}/points?topic_id=${encodeURIComponent(existing.id)}`);
                    if (res.ok) {
                        setHeatPoints(await res.json());
                    }
                    return;
                }

                const res = await fetch(`${API_BASE}/topics/${topicId}`);
                if (res.ok) {
                    const topic = await res.json();
                    setTopics(prev => (prev.some(t => t.id === topic.id) ? prev : [topic, ...prev]));
                    setSelectedTopic(topic);
                    const pointsRes = await fetch(`${API_BASE}/points?topic_id=${encodeURIComponent(topic.id)}`);
                    if (pointsRes.ok) {
                        setHeatPoints(await pointsRes.json());
                    }
                }
            } catch (err) {
                console.error("Error loading shared topic:", err);
            }
        }
        loadSharedTopic();
    }, [location.search, topics]);


    // Save light/dark mode preference
    useEffect(() => {
        if (darkMode) {
            document.body.classList.add('dark-mode');
            localStorage.setItem('darkMode', 'true');
        } else {
            document.body.classList.remove('dark-mode');
            localStorage.setItem('darkMode', 'false');
        }
    }, [darkMode]);

    // Save globe preference to localStorage
    useEffect(() => {
        localStorage.setItem('useGlobe', useGlobe.toString());
    }, [useGlobe]);

    // Save map visualization style preference to localStorage
    useEffect(() => {
        localStorage.setItem('mapVisualizationStyle', selectedMapStyle);
    }, [selectedMapStyle]);

    useEffect(() => {
        async function fetchLiveAds() {
            try {
                const res = await fetch(`${API_BASE}/api/ads/active`);
                if (res.ok) {
                    const ads = await res.json();
                    setLiveAds(ads);
                }
            } catch (err) {
                console.error("Error fetching live ads:", err);
            }
        }
        fetchLiveAds();
        const interval = setInterval(fetchLiveAds, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        (async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                setUser(session.user);
                fetchProfile(session.user.id);
            }
        })();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, sess) => {
            const u = sess?.user ?? null;
            setUser(u);
            if (u) fetchProfile(u.id);
            else setProfile(null);
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        loadNextPage();
    }, []);

    useEffect(() => {
        const container = feedRef.current;
        if (!container) return;

        const sentinel = container.querySelector("#topic-list-sentinel");
        if (!sentinel) return;

        const obs = new IntersectionObserver(
            ([entry]) => entry.isIntersecting && loadNextPage(),
            { root: container, rootMargin: "200px" }
        );

        obs.observe(sentinel);
        return () => obs.disconnect();
    }, [hasMore]);

    useEffect(() => {
        if (!selectedTopic?.id) return;
        socket.emit("subscribe_topic", { topic_id: selectedTopic.id });
        return () => socket.emit("unsubscribe_topic", { topic_id: selectedTopic.id });
    }, [selectedTopic]);

    useEffect(() => {
        const onNewTopic = t => {
            if (!t?.id) return;
            setTopics(prev => (prev.some(x => x.id === t.id) ? prev : [t, ...prev]));
        };

        const onNewPoint = p => {
            if (!p?.user_id) return;
            setHeatPoints(prev => mergeMostRecentPerUser(prev, [p]));
        };

        socket.on("new_topic", onNewTopic);
        socket.on("new_point", onNewPoint);

        return () => {
            socket.off("new_topic", onNewTopic);
            socket.off("new_point", onNewPoint);
        };
    }, []);

    // Check if selected topic has been reported
    useEffect(() => {
        if (!selectedTopic?.id) {
            setTopicHasReport(false);
            return;
        }

        const checkReport = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/topic-reports/check/${selectedTopic.id}`);
                if (res.ok) {
                    const data = await res.json();
                    setTopicHasReport(data.hasReport);
                    setTopicReportStatus(data.report); // Store the full report object
                }
            } catch (err) {
                console.error('Error checking topic report:', err);
            }
        };

        checkReport();
    }, [selectedTopic]);

    const handleReportSubmit = async () => {
        if (!reportReason) {
            alert('Please select a reason for reporting');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/topic-reports`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic_id: selectedTopic.id,
                    report_reason: reportReason,
                    reported_by: user?.id || 'anonymous'
                })
            });

            if (res.ok) {
                alert('✅ Report submitted successfully. Thank you for helping keep our community safe.');
                setReportModalOpen(false);
                setReportReason('');
                setTopicHasReport(true);
            } else {
                const error = await res.json();
                alert(`❌ ${error.error || 'Failed to submit report'}`);
            }
        } catch (err) {
            console.error('Error submitting report:', err);
            alert('❌ Network error. Please try again.');
        }
    };

    const uniqueTopics = useMemo(() => {
        const m = new Map();
        topics.forEach(t => m.set(t.id, t));
        return Array.from(m.values());
    }, [topics]);

    const filteredPoints = useMemo(() => {
        if (!useMapView || !visibleBounds) return heatPoints;
        const sw = visibleBounds.getSouthWest();
        const ne = visibleBounds.getNorthEast();
        return heatPoints.filter(p => (
            p.lat >= sw.lat &&
            p.lat <= ne.lat &&
            p.lng >= sw.lng &&
            p.lng <= ne.lng
        ));
    }, [heatPoints, visibleBounds, useMapView]);

    const filteredTopics = useMemo(() => {

        console.log('=== FILTERING TOPICS ===');
        console.log('Total topics:', uniqueTopics.length);
        console.log('Geo filter:', geoFilter);
        console.log('Profile homebase:', profile?.homebase_set, [profile?.home_lat, profile?.home_lng]);
        console.log('Sample topic:', uniqueTopics[0]);
        console.log('Topics with coordinates:', uniqueTopics.filter(t => t.lat && t.lng).length);

        let result = uniqueTopics.filter(t => {
            const matchesText = searchText
                ? t.description?.toLowerCase().includes(searchText.toLowerCase())
                : true;
            const matchesTitle = filterTitle ? t.title === filterTitle : true;
            const created = new Date(t.created_at);
            const afterStart = startDate ? created >= new Date(startDate) : true;
            const beforeEnd = endDate ? created <= new Date(endDate) : true;

            // Geo filter logic
            let matchesGeoFilter = true;
            if (geoFilter !== GEO_FILTERS.GLOBAL) {
                if (!profile?.homebase_set) {
                    // User needs homebase for distance filtering
                    matchesGeoFilter = false;
                } else if (!t.lat || !t.lng) {
                    // Topic has no coordinates - exclude it from distance filter
                    matchesGeoFilter = false;
                } else {
                    // Both user and topic have coordinates - calculate distance
                    const distance = calculateDistance(
                        profile.home_lat,
                        profile.home_lng,
                        t.lat,
                        t.lng
                    );

                    // DEBUG: Log the calculation
                    console.log('Distance calc:', {
                        topicId: t.id,
                        topicTitle: t.title,
                        topicCoords: [t.lat, t.lng],
                        topicCoordsTypes: [typeof t.lat, typeof t.lng],
                        homeCoords: [profile.home_lat, profile.home_lng],
                        homeCoordsTypes: [typeof profile.home_lat, typeof profile.home_lng],
                        distance: distance,
                        filter: geoFilter,
                        threshold: geoFilter === GEO_FILTERS.WITHIN_10KM ? 10 : 100,
                        passes: geoFilter === GEO_FILTERS.WITHIN_10KM ? distance <= 10 : distance <= 100
                    });

                    if (geoFilter === GEO_FILTERS.WITHIN_10KM) {
                        matchesGeoFilter = distance <= 10;
                    } else if (geoFilter === GEO_FILTERS.WITHIN_100KM) {
                        matchesGeoFilter = distance <= 100;
                    }
                }
            }

            return matchesText && matchesTitle && afterStart && beforeEnd && matchesGeoFilter;
        });

        result.sort((a, b) => {
            if (sortOption === "newest") {
                return new Date(b.created_at) - new Date(a.created_at);
            }
            if (sortOption === "oldest") {
                return new Date(a.created_at) - new Date(b.created_at);
            }
            if (sortOption === "mostVotes") {
                return (b.vote_count || 0) - (a.vote_count || 0);
            }
            if (sortOption === "leastVotes") {
                return (a.vote_count || 0) - (b.vote_count || 0);
            }
            return 0;
        });

        return result;
    }, [uniqueTopics, searchText, filterTitle, startDate, endDate, sortOption, geoFilter, profile]);

    const topicsWithAds = useMemo(() => {
        const result = [];
        filteredTopics.forEach((topic, index) => {
            result.push(topic);
            if ((index + 1) % 8 === 0) {
                result.push({ isAd: true, adIndex: Math.floor(index / 8) });
            }
        });
        return result;
    }, [filteredTopics]);

    const visiblePoints = useMemo(() => {
        if (!visibleBounds) return heatPoints;
        const sw = visibleBounds.getSouthWest();
        const ne = visibleBounds.getNorthEast();
        return heatPoints.filter(p => (
            p.lat >= sw.lat &&
            p.lat <= ne.lat &&
            p.lng >= sw.lng &&
            p.lng <= ne.lng
        ));
    }, [heatPoints, visibleBounds]);

    const stancePercentages = useMemo(() => {
        const counts = { "-No": 0, No: 0, Neutral: 0, Yes: 0, "Yes+": 0 };
        visiblePoints.forEach(p => {
            if (counts[p.stance] != null) counts[p.stance]++;
        });
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        return Object.fromEntries(
            Object.entries(counts).map(([s, v]) => [s, total ? Math.round((v * 100) / total) : 0])
        );
    }, [visiblePoints]);

    const avgStanceScore = useMemo(() => {
        if (!visiblePoints.length) return '–';
        const totalScore = visiblePoints.reduce((sum, p) => {
            const weight = stanceWeights[p.stance] ?? 0;
            return sum + weight;
        }, 0);
        const avg = totalScore / visiblePoints.length;
        return avg.toFixed(2);
    }, [visiblePoints]);

    return (
        <div className="app-root" style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
            <header className="app-header header--with-user">
                <h1
                    className="site-title"
                    onClick={() => window.location.reload()}
                    style={{
                        fontSize: '1.6rem',
                        fontWeight: 'bold',
                        fontFamily: 'inherit',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer',
                        color: '#eee',
                        transition: 'color 0.3s ease',
                        textAlign: 'center'
                    }}
                >
                    PulseVote
                </h1>

                <div className="header-right">
                    <button
                        onClick={() => setAboutModalOpen(true)}
                        className="info-toggle"
                        aria-label="Info and About"
                        title="About PulseVote"
                    >
                        ℹ️
                    </button>

                    <button
                        onClick={() => setMapOptionsOpen(o => !o)}
                        className="map-options-toggle"
                        aria-label="Map options"
                        title="Map visualization options"
                    >
                        🗺️
                    </button>

                    {selectedTopic && (
                        <button
                            onClick={() => setMapExpanded(!mapExpanded)}
                            className="map-expand-toggle mobile-only"
                            aria-label={mapExpanded ? "Shrink map" : "Expand map"}
                            title={mapExpanded ? "Shrink map view" : "Expand map view"}
                        >
                            {mapExpanded ? '⬇️' : '⬆️'}
                        </button>
                    )}

                    <button
                        onClick={() => setDarkMode(!darkMode)}
                        className="dark-mode-toggle"
                        aria-label="Toggle dark mode"
                        title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
                    >
                        {darkMode ? '☀️' : '🌙'}
                    </button>

                    {user && (
                        <div className="header-user-line">
                            <button className="header-email mono clickable" onClick={toggleUserSpotlight}>
                                {user.email}
                            </button>
                            {profile?.homebase_set ? (
                                <button
                                    className="header-home mono clickable"
                                    onClick={() => {
                                        if (mapRef.current) {
                                            mapRef.current.flyTo({
                                                center: [profile.home_lng, profile.home_lat],
                                                zoom: 9,
                                                duration: 2000
                                            });
                                        }
                                    }}
                                >
                                    • {profile.home_lat.toFixed(4)}, {profile.home_lng.toFixed(4)}
                                </button>
                            ) : (
                                <button className="header-action" onClick={setHomebase}>
                                    Set Homebase
                                </button>
                            )}
                            <button className="header-logout" onClick={handleLogout} aria-label="Logout">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                    <polyline points="16 17 21 12 16 7" />
                                    <line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                            </button>
                        </div>
                    )}
                </div>
            </header>

            {aboutModalOpen && (
                <div className="modal-overlay" onClick={() => setAboutModalOpen(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close" onClick={() => setAboutModalOpen(false)}>✕</button>
                        <h2 className="modal-title">About PulseVote</h2>
                        <div className="modal-body">
                            <div style={{
                                marginBottom: '1rem',
                                fontSize: '0.9rem',
                                color: darkMode ? '#ccc' : '#444',
                                whiteSpace: 'pre-line'
                            }}>
                                {aboutText || `Welcome to PulseVote — a platform where your voice matters and location tells a story.

Create topics, share your stance, and see how opinions cluster across the map. Each vote creates a visual pulse that represents the intensity and distribution of public sentiment.

Set your homebase, engage with topics that matter to you, and be part of a geo-social movement that brings transparency to public opinion.`}
                            </div>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-around',
                                marginTop: '2rem',
                                fontSize: '0.9rem',
                                color: '#666',
                                cursor: 'pointer'
                            }}>
                                <span onClick={() => setAboutText(`PulseVote is a geo-social dashboard that visualizes public sentiment by location. It empowers users to share opinions, discover regional trends, and engage in civic dialogue.`)}>About Us</span>
                                <span onClick={() => setAboutText(
                                    `Frequently Asked Questions:

1. What is PulseVote?
A geo-social dashboard for sharing and visualizing opinions.

2. Do I need an account?
No, but setting a homebase unlocks more features.

3. Can I create my own topics?
Yes! Just click "Create a New Topic" and start engaging.

4. Are there any limitations when making a topic?
Yes. Though moderation is very minimal on the site, certain words have been blocked to improve the user experience on PulseVote. You are also limited to creating only 1 voting topic in a 24 hour period to reduce spam.

5. Are there any limitations when voting?
No! Return to a topic and change your vote as often as you would like. For user-safety, there is no accessible voting history so your most recent selection is always included in the live results.

6. Are these votes legally binding or used anywhere?
Not yet. In a perfect world, we would trust our police forces to always protect us from any encroachment on our personal freedoms. This in turn would allow us to trust a public voting system without fear of repercussions, harassment, or assault. For now, PulseVote is a thought-experiment to give the world a voice and to show everyone there are more of us than you think.

7. Who runs PulseVote?
A lone Canadian data scientist has built this site and runs everything independently, there is no "big government" behind this project. Please be patient with him.`
                                )}>F.A.Q.</span>
                                <span onClick={() => {
                                    setAboutModalOpen(false);
                                    setAdSubmissionOpen(true);
                                }}>Advertise with Us</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {forgotPasswordOpen && (
                <div className="modal-overlay" onClick={() => setForgotPasswordOpen(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <button className="modal-close" onClick={() => setForgotPasswordOpen(false)}>✕</button>
                        <h2 className="modal-title">Reset Password</h2>
                        <div className="modal-body">
                            {!resetEmailSent ? (
                                <>
                                    <p style={{
                                        fontSize: '0.9rem',
                                        color: darkMode ? '#ccc' : '#666',
                                        marginBottom: '1.5rem'
                                    }}>
                                        Enter your email address and we'll send you a link to reset your password.
                                    </p>
                                    <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <input
                                            type="email"
                                            placeholder="Your email address"
                                            value={resetEmail}
                                            onChange={(e) => setResetEmail(e.target.value)}
                                            required
                                            style={{
                                                width: '100%',
                                                padding: '0.75rem',
                                                borderRadius: '6px',
                                                border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                                                fontSize: '1rem',
                                                backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                                color: darkMode ? '#e0e0e0' : '#333',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                        <button
                                            type="submit"
                                            style={{
                                                width: '100%',
                                                padding: '0.75rem',
                                                fontSize: '1rem',
                                                fontWeight: '600',
                                                borderRadius: '6px',
                                                border: 'none',
                                                backgroundColor: '#0b63a4',
                                                color: '#fff',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Send Reset Link
                                        </button>
                                    </form>
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '2rem' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                                    <p style={{ fontSize: '1.1rem', color: darkMode ? '#e0e0e0' : '#333' }}>
                                        Check your email!
                                    </p>
                                    <p style={{ fontSize: '0.9rem', color: darkMode ? '#ccc' : '#666', marginTop: '0.5rem' }}>
                                        We've sent a password reset link to <strong>{resetEmail}</strong>
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {adSubmissionOpen && (
                <div className="modal-overlay" onClick={() => resetAdForm()}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <button className="modal-close" onClick={() => resetAdForm()}>✕</button>
                        <h2 className="modal-title">Submit Your Advertisement</h2>
                        <div className="modal-body">
                            <p style={{
                                fontSize: '0.9rem',
                                color: darkMode ? '#ccc' : '#666',
                                marginBottom: '1.5rem'
                            }}>
                                Reach our engaged community with your message. Ads appear in the topic feed and are clearly marked as sponsored content.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '0.5rem',
                                        fontWeight: '600',
                                        color: darkMode ? '#e0e0e0' : '#333'
                                    }}>
                                        Company/Organization Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={adFormData.companyName}
                                        onChange={(e) => handleAdFormChange('companyName', e.target.value)}
                                        placeholder="Your company name"
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            borderRadius: '6px',
                                            border: `1px solid ${adFormErrors.companyName ? '#dc3545' : (darkMode ? '#444' : '#ddd')}`,
                                            fontSize: '1rem',
                                            backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                            color: darkMode ? '#e0e0e0' : '#333'
                                        }}
                                    />
                                    {adFormErrors.companyName && (
                                        <span style={{ color: '#dc3545', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
                                            {adFormErrors.companyName}
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '0.5rem',
                                        fontWeight: '600',
                                        color: darkMode ? '#e0e0e0' : '#333'
                                    }}>
                                        Ad Text * <span style={{ fontSize: '0.85rem', fontWeight: 'normal', color: '#666' }}>
                                            ({adFormData.adText.length}/100 characters)
                                        </span>
                                    </label>
                                    <textarea
                                        value={adFormData.adText}
                                        onChange={(e) => handleAdFormChange('adText', e.target.value)}
                                        placeholder="Your compelling ad message (max 100 characters)"
                                        maxLength={100}
                                        rows={3}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            borderRadius: '6px',
                                            border: `1px solid ${adFormErrors.adText ? '#dc3545' : (darkMode ? '#444' : '#ddd')}`,
                                            fontSize: '1rem',
                                            resize: 'vertical',
                                            backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                            color: darkMode ? '#e0e0e0' : '#333',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                    {adFormErrors.adText && (
                                        <span style={{ color: '#dc3545', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
                                            {adFormErrors.adText}
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '0.5rem',
                                        fontWeight: '600',
                                        color: darkMode ? '#e0e0e0' : '#333'
                                    }}>
                                        Link URL *
                                    </label>
                                    <input
                                        type="text"
                                        value={adFormData.linkUrl}
                                        onChange={(e) => handleAdFormChange('linkUrl', e.target.value)}
                                        placeholder="https://yourwebsite.com"
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            borderRadius: '6px',
                                            border: `1px solid ${adFormErrors.linkUrl ? '#dc3545' : (darkMode ? '#444' : '#ddd')}`,
                                            fontSize: '1rem',
                                            backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                            color: darkMode ? '#e0e0e0' : '#333'
                                        }}
                                    />
                                    {adFormErrors.linkUrl && (
                                        <span style={{ color: '#dc3545', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
                                            {adFormErrors.linkUrl}
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '0.5rem',
                                        fontWeight: '600',
                                        color: darkMode ? '#e0e0e0' : '#333'
                                    }}>
                                        Contact Email *
                                    </label>
                                    <input
                                        type="email"
                                        value={adFormData.email}
                                        onChange={(e) => handleAdFormChange('email', e.target.value)}
                                        placeholder="contact@yourcompany.com"
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            borderRadius: '6px',
                                            border: `1px solid ${adFormErrors.email ? '#dc3545' : (darkMode ? '#444' : '#ddd')}`,
                                            fontSize: '1rem',
                                            backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                            color: darkMode ? '#e0e0e0' : '#333'
                                        }}
                                    />
                                    {adFormErrors.email && (
                                        <span style={{ color: '#dc3545', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
                                            {adFormErrors.email}
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '0.5rem',
                                        fontWeight: '600',
                                        color: darkMode ? '#e0e0e0' : '#333'
                                    }}>
                                        Ad Image * <span style={{ fontSize: '0.85rem', fontWeight: 'normal', color: '#666' }}>
                                            (Recommended: 280x60px, max 5MB)
                                        </span>
                                    </label>
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/jpg,image/png,image/webp"
                                        onChange={handleImageUpload}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            borderRadius: '6px',
                                            border: `1px solid ${adFormErrors.image ? '#dc3545' : (darkMode ? '#444' : '#ddd')}`,
                                            fontSize: '1rem',
                                            backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                            color: darkMode ? '#e0e0e0' : '#333',
                                            cursor: 'pointer'
                                        }}
                                    />
                                    {adFormErrors.image && (
                                        <span style={{ color: '#dc3545', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
                                            {adFormErrors.image}
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '0.5rem',
                                        fontWeight: '600',
                                        color: darkMode ? '#e0e0e0' : '#333'
                                    }}>
                                        Start Date *
                                    </label>
                                    <input
                                        type="date"
                                        value={adFormData.startDate}
                                        onChange={(e) => handleAdFormChange('startDate', e.target.value)}
                                        min={new Date().toISOString().split('T')[0]}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            borderRadius: '6px',
                                            border: `1px solid ${adFormErrors.startDate ? '#dc3545' : (darkMode ? '#444' : '#ddd')}`,
                                            fontSize: '1rem',
                                            backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                            color: darkMode ? '#e0e0e0' : '#333',
                                            cursor: 'pointer'
                                        }}
                                    />
                                    {adFormErrors.startDate && (
                                        <span style={{ color: '#dc3545', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
                                            {adFormErrors.startDate}
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '0.5rem',
                                        fontWeight: '600',
                                        color: darkMode ? '#e0e0e0' : '#333'
                                    }}>
                                        Ad Duration *
                                    </label>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(3, 1fr)',
                                        gap: '1rem'
                                    }}>
                                        {[7, 14, 30].map(days => (
                                            <label
                                                key={days}
                                                style={{
                                                    padding: '1rem',
                                                    border: `2px solid ${adFormData.duration === days ? '#0b63a4' : (darkMode ? '#444' : '#ddd')}`,
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    textAlign: 'center',
                                                    backgroundColor: adFormData.duration === days
                                                        ? (darkMode ? '#1a3a52' : '#e3f2fd')
                                                        : (darkMode ? '#2d2d2d' : '#fff'),
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                <input
                                                    type="radio"
                                                    name="duration"
                                                    value={days}
                                                    checked={adFormData.duration === days}
                                                    onChange={(e) => handleAdFormChange('duration', parseInt(e.target.value))}
                                                    style={{ display: 'none' }}
                                                />
                                                <div style={{
                                                    fontSize: '1.2rem',
                                                    fontWeight: 'bold',
                                                    marginBottom: '0.25rem',
                                                    color: darkMode ? '#e0e0e0' : '#333'
                                                }}>
                                                    {days} days
                                                </div>
                                                <div style={{
                                                    fontSize: '1.5rem',
                                                    fontWeight: 'bold',
                                                    color: '#0b63a4'
                                                }}>
                                                    ${AD_PRICING[days]}
                                                </div>
                                                <div style={{
                                                    fontSize: '0.75rem',
                                                    color: darkMode ? '#999' : '#666',
                                                    marginTop: '0.25rem'
                                                }}>
                                                    ${(AD_PRICING[days] / days).toFixed(2)}/day
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {adFormData.imagePreview && adFormData.adText && (
                                    <div>
                                        <label style={{
                                            display: 'block',
                                            marginBottom: '0.5rem',
                                            fontWeight: '600',
                                            color: darkMode ? '#e0e0e0' : '#333'
                                        }}>
                                            Preview:
                                        </label>
                                        <div style={{
                                            cursor: 'default',
                                            border: '2px solid rgba(255, 255, 255, 0.3)',
                                            position: 'relative',
                                            overflow: 'hidden',
                                            padding: 0,
                                            height: '120px',
                                            borderRadius: '8px'
                                        }}>
                                            <img
                                                src={adFormData.imagePreview}
                                                alt={adFormData.companyName}
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    objectFit: 'cover',
                                                    position: 'absolute',
                                                    top: 0,
                                                    left: 0
                                                }}
                                            />
                                            <div style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                right: 0,
                                                bottom: 0,
                                                background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 100%)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                                padding: '1rem',
                                                textAlign: 'center'
                                            }}>
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '8px',
                                                    right: '8px',
                                                    background: 'rgba(0,0,0,0.7)',
                                                    color: '#fff',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 'bold'
                                                }}>
                                                    SPONSORED
                                                </div>
                                                <div style={{
                                                    fontSize: '1.15rem',
                                                    fontWeight: 'bold',
                                                    marginBottom: '0.25rem',
                                                    color: '#fff',
                                                    textShadow: '0 2px 8px rgba(0,0,0,0.8)'
                                                }}>
                                                    {adFormData.companyName || 'Your Company'}
                                                </div>
                                                <div style={{
                                                    fontSize: '0.85rem',
                                                    color: '#fff',
                                                    textShadow: '0 2px 6px rgba(0,0,0,0.8)',
                                                    marginBottom: '0.5rem'
                                                }}>
                                                    {adFormData.adText || 'Your ad text here'}
                                                </div>
                                                <div style={{
                                                    padding: '6px 16px',
                                                    background: 'rgba(255,255,255,0.25)',
                                                    borderRadius: '20px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 'bold',
                                                    color: '#fff',
                                                    backdropFilter: 'blur(10px)',
                                                    border: '1px solid rgba(255,255,255,0.3)'
                                                }}>
                                                    Learn More →
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div style={{
                                    padding: '1rem',
                                    backgroundColor: darkMode ? '#1a3a52' : '#e3f2fd',
                                    borderRadius: '8px',
                                    border: '1px solid #0b63a4'
                                }}>
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        marginBottom: '0.5rem',
                                        color: darkMode ? '#e0e0e0' : '#333'
                                    }}>
                                        <span>Duration:</span>
                                        <strong>{adFormData.duration} days</strong>
                                    </div>
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        fontSize: '1.2rem',
                                        fontWeight: 'bold',
                                        color: darkMode ? '#e0e0e0' : '#333'
                                    }}>
                                        <span>Total:</span>
                                        <span>${AD_PRICING[adFormData.duration]} USD</span>
                                    </div>
                                </div>

                                <Elements stripe={stripePromise}>
                                    <CheckoutForm
                                        adFormData={adFormData}
                                        validateForm={validateAdForm}
                                        onSuccess={handleAdSubmit}
                                        onError={(error) => {
                                            alert(`Payment error: ${error}`);
                                            setAdFormSubmitting(false);
                                        }}
                                        darkMode={darkMode}
                                    />
                                </Elements>

                                <p style={{
                                    fontSize: '0.75rem',
                                    color: darkMode ? '#999' : '#666',
                                    textAlign: 'center',
                                    marginTop: '0.5rem'
                                }}>
                                    By submitting, you agree to our advertising terms. We'll review your ad within 24 hours.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {reportModalOpen && (
                <div className="modal-overlay" onClick={() => setReportModalOpen(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <button className="modal-close" onClick={() => setReportModalOpen(false)}>✕</button>
                        <h2 className="modal-title">🚨 Report Topic</h2>
                        <div className="modal-body">
                            <p style={{
                                fontSize: '0.9rem',
                                color: darkMode ? '#ccc' : '#666',
                                marginBottom: '1.5rem'
                            }}>
                                Please select a reason for reporting this topic. Reports are reviewed by our moderation team.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <label style={{
                                    display: 'block',
                                    marginBottom: '0.5rem',
                                    fontWeight: '600',
                                    color: darkMode ? '#e0e0e0' : '#333'
                                }}>
                                    Reason for Report *
                                </label>

                                {[
                                    { value: 'spam', label: '🚫 Spam' },
                                    { value: 'inappropriate', label: '⚠️ Inappropriate Content' },
                                    { value: 'misinformation', label: '🔍 Misinformation' },
                                    { value: 'harassment', label: '🛑 Harassment' },
                                    { value: 'off_topic', label: '📌 Off Topic' },
                                    { value: 'duplicate', label: '📋 Duplicate' },
                                    { value: 'other', label: '❓ Other' }
                                ].map(reason => (
                                    <label
                                        key={reason.value}
                                        style={{
                                            padding: '1rem',
                                            border: `2px solid ${reportReason === reason.value ? '#dc3545' : (darkMode ? '#444' : '#ddd')}`,
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            backgroundColor: reportReason === reason.value
                                                ? (darkMode ? '#3d1f1f' : '#ffe5e5')
                                                : (darkMode ? '#2d2d2d' : '#fff'),
                                            transition: 'all 0.2s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem'
                                        }}
                                    >
                                        <input
                                            type="radio"
                                            name="report-reason"
                                            value={reason.value}
                                            checked={reportReason === reason.value}
                                            onChange={(e) => setReportReason(e.target.value)}
                                            style={{ width: '18px', height: '18px' }}
                                        />
                                        <span style={{
                                            fontSize: '1rem',
                                            color: darkMode ? '#e0e0e0' : '#333'
                                        }}>
                                            {reason.label}
                                        </span>
                                    </label>
                                ))}

                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                                    <button
                                        onClick={handleReportSubmit}
                                        disabled={!reportReason}
                                        style={{
                                            flex: 1,
                                            padding: '0.75rem',
                                            fontSize: '1rem',
                                            fontWeight: '600',
                                            borderRadius: '6px',
                                            border: 'none',
                                            backgroundColor: reportReason ? '#dc3545' : '#999',
                                            color: '#fff',
                                            cursor: reportReason ? 'pointer' : 'not-allowed',
                                            opacity: reportReason ? 1 : 0.6,
                                            transition: 'background-color 0.2s ease'
                                        }}
                                    >
                                        Submit Report
                                    </button>
                                    <button
                                        onClick={() => {
                                            setReportModalOpen(false);
                                            setReportReason('');
                                        }}
                                        style={{
                                            flex: 1,
                                            padding: '0.75rem',
                                            fontSize: '1rem',
                                            fontWeight: '600',
                                            borderRadius: '6px',
                                            border: `2px solid ${darkMode ? '#444' : '#ddd'}`,
                                            backgroundColor: 'transparent',
                                            color: darkMode ? '#e0e0e0' : '#333',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {mapOptionsOpen && (
                <div className="modal-overlay" onClick={() => setMapOptionsOpen(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close" onClick={() => setMapOptionsOpen(false)}>✕</button>
                        <h2 className="modal-title">Map Visualization Options</h2>
                        <div className="modal-body">
                            {/* Globe Toggle */}
                            <div style={{
                                marginBottom: '1.5rem',
                                padding: '1rem',
                                border: `2px solid ${darkMode ? '#444' : '#ddd'}`,
                                borderRadius: '8px',
                                backgroundColor: darkMode ? '#2d2d2d' : '#f8f9fa'
                            }}>
                                <label style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    cursor: 'pointer',
                                    fontSize: '1rem',
                                    fontWeight: '600'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={useGlobe}
                                        onChange={(e) => setUseGlobe(e.target.checked)}
                                        style={{
                                            width: '20px',
                                            height: '20px',
                                            cursor: 'pointer'
                                        }}
                                    />
                                    <span style={{ color: darkMode ? '#e0e0e0' : '#333' }}>
                                        🌍 Enable 3D Globe View
                                    </span>
                                </label>
                                <p style={{
                                    fontSize: '0.85rem',
                                    color: darkMode ? '#999' : '#666',
                                    marginTop: '0.5rem',
                                    marginLeft: '2rem'
                                }}>
                                    View the map as a rotating 3D globe (works best at low zoom levels)
                                </p>
                            </div>

                            {/* Visualization Style Options */}
                            <h3 style={{
                                marginBottom: '1rem',
                                color: darkMode ? '#e0e0e0' : '#333',
                                fontSize: '1rem'
                            }}>
                                Visualization Style
                            </h3>
                            <div className="map-style-options" style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                                gap: '1rem'
                            }}>
                                <div
                                    className={`map-style-card ${selectedMapStyle === "heatmap" ? "selected" : ""}`}
                                    onClick={() => setSelectedMapStyle("heatmap")}
                                    style={{
                                        padding: '1.5rem',
                                        border: `3px solid ${selectedMapStyle === "heatmap" ? '#0b63a4' : (darkMode ? '#444' : '#ddd')}`,
                                        borderRadius: '12px',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        backgroundColor: selectedMapStyle === "heatmap"
                                            ? (darkMode ? '#1a3a52' : '#e3f2fd')
                                            : (darkMode ? '#2d2d2d' : '#fff'),
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔥</div>
                                    <span style={{ fontWeight: 'bold', color: darkMode ? '#e0e0e0' : '#333' }}>Heatmap</span>
                                </div>

                                <div
                                    className={`map-style-card ${selectedMapStyle === "choropleth" ? "selected" : ""}`}
                                    onClick={() => setSelectedMapStyle("choropleth")}
                                    style={{
                                        padding: '1.5rem',
                                        border: `3px solid ${selectedMapStyle === "choropleth" ? '#0b63a4' : (darkMode ? '#444' : '#ddd')}`,
                                        borderRadius: '12px',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        backgroundColor: selectedMapStyle === "choropleth"
                                            ? (darkMode ? '#1a3a52' : '#e3f2fd')
                                            : (darkMode ? '#2d2d2d' : '#fff'),
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗺️</div>
                                    <span style={{ fontWeight: 'bold', color: darkMode ? '#e0e0e0' : '#333' }}>Grid Choropleth</span>
                                </div>

                                <div
                                    className={`map-style-card ${selectedMapStyle === "custom-choropleth" ? "selected" : ""}`}
                                    onClick={() => setSelectedMapStyle("custom-choropleth")}
                                    style={{
                                        padding: '1.5rem',
                                        border: `3px solid ${selectedMapStyle === "custom-choropleth" ? '#0b63a4' : (darkMode ? '#444' : '#ddd')}`,
                                        borderRadius: '12px',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        backgroundColor: selectedMapStyle === "custom-choropleth"
                                            ? (darkMode ? '#1a3a52' : '#e3f2fd')
                                            : (darkMode ? '#2d2d2d' : '#fff'),
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🌍</div>
                                    <span style={{ fontWeight: 'bold', color: darkMode ? '#e0e0e0' : '#333' }}>Regional Choropleth</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="app-main" style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                <main className="map-column" style={{ flex: 1, position: 'relative' }}>
                    <div
                        ref={mapContainerRef}
                        style={{
                            width: '100%',
                            height: '100%',
                            position: 'absolute',
                            top: 0,
                            left: 0
                        }}
                    />
                </main>

                <aside className="right-column">
                    {userSpotlightOpen ? (
                        selectedUserPoint ? (
                            <section className="spotlight-section card">
                                <button className="spotlight-close" onClick={closeUserSpotlight}>✕</button>
                                <div className="spotlight-content">
                                    <h3 className="spotlight-title">Your Vote Details</h3>
                                    <p>Topic: {selectedUserPoint.topic?.id || 'Unknown'}</p>
                                    <p>Stance: <strong>{selectedUserPoint.stance}</strong></p>
                                    <p>Date: {new Date(selectedUserPoint.created_at).toLocaleDateString()}</p>
                                </div>
                            </section>
                        ) : (
                            <section className="user-spotlight-section">
                                <button className="spotlight-close" onClick={closeUserSpotlight}>✕</button>
                                <h2 className="section-title">User Profile</h2>

                                {profile?.homebase_set && (
                                    <div className="homebase-info card" style={{ marginBottom: '1rem' }}>
                                        <h3>🏠 Your Homebase</h3>
                                        <p className="mono">{homebaseName}</p>
                                        <p className="mono small">{profile.home_lat.toFixed(4)}, {profile.home_lng.toFixed(4)}</p>
                                        <button onClick={resetHomebase} className="btn-secondary" style={{ marginTop: '0.5rem' }}>
                                            Reset Homebase
                                        </button>
                                    </div>
                                )}
                                
                            </section>
                        )
                    ) : selectedTopic ? (
                            <section className={`spotlight-section ${mapExpanded ? 'spotlight-minimized' : ''}`}>
                                <button className="spotlight-close" onClick={closeSpotlight}>✕</button>

                                <div className="spotlight-header">
                                    <h2 className="spotlight-title">
                                        {topicIcons[selectedTopic.title] || ''} {selectedTopic.title}
                                    </h2>
                                    <button
                                        className="share-btn"
                                        onClick={() => handleShare(selectedTopic.id)}
                                        title="Share this topic"
                                    >
                                        🔗 Share
                                    </button>
                                </div>

                                {heatPoints.length > 0 && (
                                    <div className="stats-panel card">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                            <h3 style={{ margin: 0 }}>Visible Area Stats</h3>
                                            <div style={{
                                                fontSize: '0.85rem',
                                                color: darkMode ? '#999' : '#666',
                                                fontWeight: '600'
                                            }}>
                                                {visiblePoints.length} / {heatPoints.length} votes
                                            </div>
                                        </div>
                                        <div className="avg-score-box">
                                            <span className="label">Average Score:</span>
                                            <span className={`avg-score ${getAvgBoxColor(avgStanceScore)}`}>
                                                {avgStanceScore}
                                            </span>
                                        </div>

                                        <div className="stance-breakdown">
                                            {Object.entries(stancePercentages).map(([stance, pct]) => (
                                                <div key={stance} className="stance-row">
                                                    <span className={`stance-label stance-${stance.toLowerCase()}`}>
                                                        {stance}
                                                    </span>
                                                    <div className="stance-bar-container">
                                                        <div
                                                            className="stance-bar"
                                                            style={{
                                                                width: `${pct}%`,
                                                                backgroundColor: STANCE_COLOR[stance]
                                                            }}
                                                        />
                                                    </div>
                                                    <span className="stance-pct">{pct}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="spotlight-description-wrapper">
                                    <div className="spotlight-description card">
                                        <p>{selectedTopic.description}<br /><br /><br /></p>
                                        <p className="topic-meta">
                                            Created {new Date(selectedTopic.created_at).toLocaleDateString()}
                                            <br />
                                            User ID: {selectedTopic.created_by}
                                            <br />
                                            {topicReportStatus ? (
                                                // Show status based on review action
                                                topicReportStatus.status === 'pending_review' ? (
                                                    <span style={{
                                                        color: '#ffa500',
                                                        fontSize: '0.9rem',
                                                        padding: '0.25rem 0',
                                                        marginTop: '0.5rem',
                                                        display: 'inline-block'
                                                    }}>
                                                        ⏳ Report Pending Review
                                                    </span>
                                                ) : topicReportStatus.review_action === 'approved' ? (
                                                    <span style={{
                                                        color: '#28a745',
                                                        fontSize: '0.9rem',
                                                        padding: '0.25rem 0',
                                                        marginTop: '0.5rem',
                                                        display: 'inline-block'
                                                    }}>
                                                        ⭐ Reviewed - Approved
                                                    </span>
                                                ) : topicReportStatus.review_action === 'denied' ? (
                                                    <span style={{
                                                        color: '#666',
                                                        fontSize: '0.9rem',
                                                        padding: '0.25rem 0',
                                                        marginTop: '0.5rem',
                                                        display: 'inline-block'
                                                    }}>
                                                        ✓ Reviewed - Report Denied
                                                    </span>
                                                ) : null
                                            ) : (
                                                <button
                                                    onClick={() => setReportModalOpen(true)}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: '#dc3545',
                                                        cursor: 'pointer',
                                                        fontSize: '0.9rem',
                                                        textDecoration: 'underline',
                                                        padding: '0.25rem 0',
                                                        marginTop: '0.5rem'
                                                    }}
                                                >
                                                    🚨 Report
                                                </button>
                                            )}
                                        </p>
                                    </div>
                                </div>

                                {user && profile?.homebase_set ? (
                                    <form onSubmit={handleEngage} className="engage-form card">
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '1rem' }}>
                                            Cast Your Vote:
                                        </label>
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(5, 1fr)',
                                            gap: '0.5rem',
                                            marginBottom: '0.75rem',
                                            width: '100%'
                                        }}>
                                            {['-No', 'No', 'Neutral', 'Yes', 'Yes+'].map(s => (
                                                <label
                                                    key={s}
                                                    style={{
                                                        padding: '0.75rem 0.5rem',
                                                        border: `2px solid ${engageStance === s ? STANCE_COLOR[s] : (darkMode ? '#444' : '#ddd')}`,
                                                        borderRadius: '6px',
                                                        textAlign: 'center',
                                                        cursor: 'pointer',
                                                        backgroundColor: engageStance === s ? `${STANCE_COLOR[s]}22` : (darkMode ? '#2d2d2d' : 'transparent'),
                                                        transition: 'all 0.2s',
                                                        minHeight: '10px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="engage-stance"
                                                        value={s}
                                                        checked={engageStance === s}
                                                        onChange={(e) => setEngageStance(e.target.value)}
                                                        style={{ display: 'none' }}
                                                    />
                                                    <span style={{ color: STANCE_COLOR[s], fontWeight: 'bold', fontSize: '0.85rem' }}>
                                                        {s}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                        <button
                                            type="submit"
                                            className="btn-primary"
                                            disabled={!engageStance}
                                        >
                                            Submit Vote
                                        </button>
                                    </form>
                                ) : (
                                    <div className="auth-prompt card">
                                        <p>Sign in and set your homebase to vote on this topic!</p>
                                        {!user && (
                                            <div className="auth-forms" style={{ marginTop: '1rem' }}>
                                                {authMode === "login" ? (
                                                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        <input
                                                            type="email"
                                                            placeholder="Email"
                                                            value={loginEmail}
                                                            onChange={(e) => setLoginEmail(e.target.value)}
                                                            required
                                                            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                                                        />
                                                        <input
                                                            type="password"
                                                            placeholder="Password"
                                                            value={loginPassword}
                                                            onChange={(e) => setLoginPassword(e.target.value)}
                                                            required
                                                            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                                                        />
                                                        <button type="submit" className="btn-primary">Login</button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setAuthMode("signup")}
                                                            className="btn-secondary"
                                                        >
                                                            Need an account? Sign up
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setForgotPasswordOpen(true)}
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                color: '#0b63a4',
                                                                cursor: 'pointer',
                                                                fontSize: '0.9rem',
                                                                textDecoration: 'underline'
                                                            }}
                                                        >
                                                            Forgot password?
                                                        </button>
                                                    </form>
                                                ) : (
                                                    <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        <input
                                                            type="email"
                                                            placeholder="Email"
                                                            value={signUpEmail}
                                                            onChange={(e) => setSignUpEmail(e.target.value)}
                                                            required
                                                            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                                                        />
                                                        <input
                                                            type="password"
                                                            placeholder="Password"
                                                            value={signUpPassword}
                                                            onChange={(e) => setSignUpPassword(e.target.value)}
                                                            required
                                                            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                                                        />
                                                        <button type="submit" className="btn-primary">Sign Up</button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setAuthMode("login")}
                                                            className="btn-secondary"
                                                        >
                                                            Already have an account? Login
                                                        </button>
                                                    </form>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </section>
                    ) : (
                        <>
                                    {!user ? (
                                        <section className="auth-section card">
                                            <h2 className="section-title">Welcome to PulseVote</h2>
                                            <p style={{ marginBottom: '1rem', color: '#666' }}>
                                                Sign in to create topics and vote.
                                            </p>

                                            <div className="auth-tabs" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                                <button
                                                    onClick={() => setAuthMode("login")}
                                                    className={authMode === "login" ? "tab-active" : "tab-inactive"}
                                                    style={{
                                                        flex: 1,
                                                        padding: '0.5rem',
                                                        border: 'none',
                                                        borderBottom: authMode === "login" ? '2px solid #0b63a4' : '2px solid transparent',
                                                        background: 'none',
                                                        cursor: 'pointer',
                                                        fontWeight: authMode === "login" ? 'bold' : 'normal'
                                                    }}
                                                >
                                                    Login
                                                </button>
                                                <button
                                                    onClick={() => setAuthMode("signup")}
                                                    className={authMode === "signup" ? "tab-active" : "tab-inactive"}
                                                    style={{
                                                        flex: 1,
                                                        padding: '0.5rem',
                                                        border: 'none',
                                                        borderBottom: authMode === "signup" ? '2px solid #0b63a4' : '2px solid transparent',
                                                        background: 'none',
                                                        cursor: 'pointer',
                                                        fontWeight: authMode === "signup" ? 'bold' : 'normal'
                                                    }}
                                                >
                                                    Sign Up
                                                </button>
                                            </div>

                                            {authMode === "login" ? (
                                                <>
                                                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                        <input
                                                            type="email"
                                                            placeholder="Email"
                                                            value={loginEmail}
                                                            onChange={(e) => setLoginEmail(e.target.value)}
                                                            required
                                                            style={{
                                                                padding: '0.75rem',
                                                                borderRadius: '6px',
                                                                border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                                                                backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                                                color: darkMode ? '#e0e0e0' : '#333'
                                                            }}
                                                        />
                                                        <input
                                                            type="password"
                                                            placeholder="Password"
                                                            value={loginPassword}
                                                            onChange={(e) => setLoginPassword(e.target.value)}
                                                            required
                                                            style={{
                                                                padding: '0.75rem',
                                                                borderRadius: '6px',
                                                                border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                                                                backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                                                color: darkMode ? '#e0e0e0' : '#333'
                                                            }}
                                                        />
                                                        <button type="submit" className="btn-primary">Login</button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setForgotPasswordOpen(true)}
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                color: '#0b63a4',
                                                                cursor: 'pointer',
                                                                fontSize: '0.9rem',
                                                                textDecoration: 'underline'
                                                            }}
                                                        >
                                                            Forgot password?
                                                        </button>
                                                    </form>

                                                    {/* OAuth Buttons for Login */}
                                                    <div style={{
                                                        marginTop: "1rem",
                                                        paddingTop: "1rem",
                                                        borderTop: "1px solid #ddd",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        gap: "0.75rem"
                                                    }}>
                                                        <p style={{
                                                            fontSize: "0.85rem",
                                                            color: "#666",
                                                            margin: "0"
                                                        }}>
                                                            Or login with:
                                                        </p>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOAuthSignIn('google')}
                                                            title="Continue with Google"
                                                            style={{
                                                                width: "30px",
                                                                height: "30px",
                                                                padding: "0",
                                                                background: "#fff",
                                                                border: "1px solid #ddd",
                                                                borderRadius: "50%",
                                                                cursor: "pointer",
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "center"
                                                            }}
                                                        >
                                                            <svg width="20" height="20" viewBox="0 0 24 24">
                                                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOAuthSignIn('discord')}
                                                            title="Continue with Discord"
                                                            style={{
                                                                width: "30px",
                                                                height: "30px",
                                                                padding: "0",
                                                                background: "#5865F2",
                                                                border: "none",
                                                                borderRadius: "50%",
                                                                cursor: "pointer",
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "center"
                                                            }}
                                                        >
                                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                                                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                        <input
                                                            type="email"
                                                            placeholder="Email"
                                                            value={signUpEmail}
                                                            onChange={(e) => setSignUpEmail(e.target.value)}
                                                            required
                                                            minLength={6}
                                                            style={{
                                                                padding: '0.75rem',
                                                                borderRadius: '6px',
                                                                border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                                                                backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                                                color: darkMode ? '#e0e0e0' : '#333'
                                                            }}
                                                        />
                                                        <input
                                                            type="password"
                                                            placeholder="Password (min 6 characters)"
                                                            value={signUpPassword}
                                                            onChange={(e) => setSignUpPassword(e.target.value)}
                                                            required
                                                            minLength={6}
                                                            style={{
                                                                padding: '0.75rem',
                                                                borderRadius: '6px',
                                                                border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                                                                backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                                                color: darkMode ? '#e0e0e0' : '#333'
                                                            }}
                                                        />
                                                        <button type="submit" className="btn-primary">Sign Up</button>
                                                    </form>

                                                    {/* OAuth Buttons for Sign Up */}
                                                    <div style={{
                                                        marginTop: "1rem",
                                                        paddingTop: "1rem",
                                                        borderTop: "1px solid #ddd",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        gap: "0.75rem"
                                                    }}>
                                                        <p style={{
                                                            fontSize: "0.85rem",
                                                            color: "#666",
                                                            margin: "0"
                                                        }}>
                                                            Or sign up with:
                                                        </p>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOAuthSignIn('google')}
                                                            title="Continue with Google"
                                                            style={{
                                                                width: "30px",
                                                                height: "30px",
                                                                padding: "0",
                                                                background: "#fff",
                                                                border: "1px solid #ddd",
                                                                borderRadius: "50%",
                                                                cursor: "pointer",
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "center"
                                                            }}
                                                        >
                                                            <svg width="20" height="20" viewBox="0 0 24 24">
                                                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOAuthSignIn('discord')}
                                                            title="Continue with Discord"
                                                            style={{
                                                                width: "30px",
                                                                height: "30px",
                                                                padding: "0",
                                                                background: "#5865F2",
                                                                border: "none",
                                                                borderRadius: "50%",
                                                                cursor: "pointer",
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "center"
                                                            }}
                                                        >
                                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                                                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </section>
                                    ) : (
                                            <section className="create-section card">
                                                <div className="accordion-header" onClick={() => setCreateOpen(!createOpen)}>
                                                    <h3>Create a New Topic</h3>
                                                    <button
                                                        className={`accordion-toggle ${createOpen ? 'open' : ''}`}
                                                        type="button"
                                                    >
                                                        <span className="plus">+</span>
                                                    </button>
                                                </div>

                                                <div className={`accordion-body ${createOpen ? 'expanded' : ''}`}>
                                                    <form onSubmit={handleCreateTopic} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                        <select
                                                            value={selectedPresetTitle}
                                                            onChange={(e) => setSelectedPresetTitle(e.target.value)}
                                                            required
                                                            style={{
                                                                padding: '0.75rem',
                                                                borderRadius: '6px',
                                                                border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                                                                backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                                                color: darkMode ? '#e0e0e0' : '#333'
                                                            }}
                                                        >
                                                            <option value="">-- Select --</option>
                                                            {Object.keys(topicIcons).map(title => (
                                                                <option key={title} value={title}>
                                                                    {topicIcons[title]} {title}
                                                                </option>
                                                            ))}
                                                        </select>

                                            <textarea
                                                placeholder="Describe your topic..."
                                                value={newDescription}
                                                onChange={(e) => {
                                                    setNewDescription(e.target.value);
                                                    setHasFilteredWords(containsFilteredWords(e.target.value));
                                                }}
                                                required
                                                rows={4}
                                                style={{
                                                    padding: '0.75rem',
                                                    borderRadius: '6px',
                                                    border: `1px solid ${hasFilteredWords ? '#dc3545' : (darkMode ? '#444' : '#ddd')}`,
                                                    backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                                    color: darkMode ? '#e0e0e0' : '#333',
                                                    resize: 'vertical'
                                                }}
                                            />
                                            {hasFilteredWords && (
                                                <p style={{ color: '#dc3545', fontSize: '0.85rem' }}>
                                                    Your description contains filtered words. Please revise.
                                                </p>
                                            )}

                                            <div className="stance-selector">
                                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                                                    Your Stance:
                                                </label>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
                                                                {['-No', 'No', 'Neutral', 'Yes', 'Yes+'].map(s => (
                                                                    <label
                                                                        key={s}
                                                                        style={{
                                                                            padding: '0.75rem 0.5rem',
                                                                            border: `2px solid ${engageStance === s ? STANCE_COLOR[s] : (darkMode ? '#444' : '#ddd')}`,
                                                                            borderRadius: '6px',
                                                                            textAlign: 'center',
                                                                            cursor: 'pointer',
                                                                            backgroundColor: engageStance === s ? `${STANCE_COLOR[s]}22` : (darkMode ? '#2d2d2d' : 'transparent'),
                                                                            transition: 'all 0.2s',
                                                                            minHeight: '10px',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center'
                                                                        }}
                                                                    >
                                                            <input
                                                                type="radio"
                                                                name="create-stance"
                                                                value={s}
                                                                checked={stance === s}
                                                                onChange={(e) => setStance(e.target.value)}
                                                                style={{ display: 'none' }}
                                                            />
                                                            <span style={{ color: STANCE_COLOR[s], fontWeight: 'bold', fontSize: '0.85rem' }}>
                                                                {s}
                                                            </span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>

                                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                            <button
                                                                type="submit"
                                                                className="btn-primary"
                                                                disabled={hasFilteredWords || !stance || !profile?.homebase_set}
                                                                style={{ flex: 1 }}
                                                            >
                                                                Create Topic
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setCreateOpen(false);
                                                                    setNewDescription("");
                                                                    setStance("");
                                                                    setSelectedPresetTitle("");
                                                                    setHasFilteredWords(false);
                                                                }}
                                                                className="btn-secondary"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </form>
                                                </div>
                                            </section>
                            )}

                                    <section className="feed-section">
                                        <div className="filter-section card" style={{ marginBottom: '1rem' }}>
                                            <div className="accordion-header" onClick={() => setFilterOpen(!filterOpen)}>
                                                <h3>Filters</h3>
                                                <button
                                                    className={`accordion-toggle ${filterOpen ? 'open' : ''}`}
                                                    type="button"
                                                >
                                                    <span className="plus">+</span>
                                                </button>
                                            </div>
                                            <div className={`accordion-body ${filterOpen ? 'expanded' : ''}`}>
                                                <form style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                    <input
                                                        type="text"
                                                        placeholder="Search topics..."
                                                        value={searchText}
                                                        onChange={(e) => setSearchText(e.target.value)}
                                                        style={{
                                                            padding: '0.75rem',
                                                            borderRadius: '6px',
                                                            border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                                                            backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                                            color: darkMode ? '#e0e0e0' : '#333'
                                                        }}
                                                    />
                                                    <select
                                                        value={filterTitle}
                                                        onChange={(e) => setFilterTitle(e.target.value)}
                                                        style={{
                                                            padding: '0.75rem',
                                                            borderRadius: '6px',
                                                            border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                                                            backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                                            color: darkMode ? '#e0e0e0' : '#333'
                                                        }}
                                                    >
                                                        <option value="">All Categories</option>
                                                        {Object.keys(topicIcons).map(title => (
                                                            <option key={title} value={title}>
                                                                {topicIcons[title]} {title}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <input
                                                            type="date"
                                                            value={startDate}
                                                            onChange={(e) => setStartDate(e.target.value)}
                                                            placeholder="Start date"
                                                            style={{
                                                                flex: 1,
                                                                padding: '0.75rem',
                                                                borderRadius: '6px',
                                                                border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                                                                backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                                                color: darkMode ? '#e0e0e0' : '#333'
                                                            }}
                                                        />
                                                        <input
                                                            type="date"
                                                            value={endDate}
                                                            onChange={(e) => setEndDate(e.target.value)}
                                                            placeholder="End date"
                                                            style={{
                                                                flex: 1,
                                                                padding: '0.75rem',
                                                                borderRadius: '6px',
                                                                border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                                                                backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                                                color: darkMode ? '#e0e0e0' : '#333'
                                                            }}
                                                        />
                                                    </div>
                                                    <select
                                                        value={sortOption}
                                                        onChange={(e) => setSortOption(e.target.value)}
                                                        style={{
                                                            padding: '0.75rem',
                                                            borderRadius: '6px',
                                                            border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                                                            backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                                            color: darkMode ? '#e0e0e0' : '#333'
                                                        }}
                                                    >
                                                        <option value="newest">Newest First</option>
                                                        <option value="oldest">Oldest First</option>
                                                        <option value="mostVotes">Most Votes</option>
                                                        <option value="leastVotes">Least Votes</option>
                                                    </select>

                                                    <select
                                                        value={geoFilter}
                                                        onChange={(e) => setGeoFilter(e.target.value)}
                                                        style={{
                                                            padding: '0.75rem',
                                                            borderRadius: '6px',
                                                            border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                                                            backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                                            color: darkMode ? '#e0e0e0' : '#333'
                                                        }}
                                                    >
                                                        <option value={GEO_FILTERS.GLOBAL}>Global</option>
                                                        <option value={GEO_FILTERS.WITHIN_10KM}>Within 10km</option>
                                                        <option value={GEO_FILTERS.WITHIN_100KM}>Within 100km</option>
                                                    </select>

                                                    {geoFilter !== GEO_FILTERS.GLOBAL && !profile?.homebase_set && (
                                                        <p style={{
                                                            fontSize: '0.85rem',
                                                            color: '#dc3545',
                                                            marginTop: '0.5rem',
                                                            textAlign: 'center'
                                                        }}>
                                                            ⚠️ Set your homebase to use distance filters
                                                        </p>
                                                    )}

                                                    {(searchText || filterTitle || startDate || endDate || sortOption !== 'newest') && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSearchText('');
                                                                setFilterTitle('');
                                                                setStartDate('');
                                                                setEndDate('');
                                                                setSortOption('newest');
                                                            }}
                                                            className="btn-secondary"
                                                        >
                                                            Clear Filters
                                                        </button>
                                                    )}
                                                </form>
                                            </div>
                                        </div> 

                                        <ul className="topic-list" ref={feedRef}>
                                            {topicsWithAds.map((item, idx) => {
                                                if (item.isAd) {
                                                    return <AdCard key={`ad-${idx}`} adIndex={item.adIndex} liveAds={liveAds} />;
                                                }

                                                const topic = item;
                                                return (
                                                    <li
                                                        key={topic.id}
                                                        className="feed-item"
                                                        onClick={() => handleSelectTopic(topic)}
                                                    >
                                                        <div className="topic-header">
                                                            <h3 className="topic-title">
                                                                {topicIcons[topic.title] || ''} {topic.title}
                                                            </h3>
                                                            <span className="topic-date">
                                                                {new Date(topic.created_at).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                        <p className="topic-description">{topic.description}</p>
                                                        {topic.vote_count > 0 && (
                                                            <span className="vote-count">
                                                                {topic.vote_count} vote{topic.vote_count !== 1 ? 's' : ''}
                                                            </span>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                            <li id="topic-list-sentinel" style={{ height: '1px' }} />
                                        </ul>
                                    </section>
                        </>
                    )}
                </aside>
            </div>
        </div>
    );
}