// src/App.js

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "react-router-dom";
import L from "leaflet";
import "leaflet.heat";
import { MapContainer, TileLayer, Circle, useMap } from "react-leaflet";
import { io } from "socket.io-client";
import { supabase } from "./supabaseClient";
import "leaflet/dist/leaflet.css";
import "./App.css";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000";
const socket = io(API_BASE);

const STANCE_COLOR = {
    "-No": "#648FFF",
    No: "#785EF0",
    Neutral: "#DC267F",
    Yes: "#FE6100",
    "Yes+": "#FFB000",
};

// Sample ad data - customize these later
const AD_DATA = [
    {
        title: "Advertise with us",
        description: "Connect with your community",
        image: "https://picsum.photos/id/1043/280/160",
        url: "https://example.com/events",
    },
    {
        title: "Advertise with us",
        description: "Join thousands making a difference",
        image: "https://picsum.photos/id/1036/280/160",
        url: "https://example.com/survey",
    },
    {
        title: "Advertise with us",
        description: "Get the latest civic updates",
        image: "https://picsum.photos/id/1029/280/160",
        url: "https://example.com/news",
    },
];

// Word filter for topic descriptions
const FILTERED_WORDS = [
    "fuck",
    "shit",
    "cunt",
    "motherfucker",
    "asshole",
    // Add more words as needed
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

function MapSetter({ onMapReady }) {
    const map = useMap();
    useEffect(() => onMapReady(map), [map, onMapReady]);
    return null;
}

function AdCard({ adIndex }) {
    const ad = AD_DATA[adIndex % AD_DATA.length];

    return (
        <li
            className="feed-item ad-card"
            onClick={() => window.open(ad.url, '_blank')}
            style={{
                cursor: 'pointer',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                position: 'relative',
                overflow: 'hidden',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                padding: 0,
                height: '120px'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.2)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
            }}
        >
            <img
                src={ad.image}
                alt={ad.title}
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
                    fontWeight: 'bold',
                    letterSpacing: '0.5px'
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
                    {ad.title}
                </div>
                <div style={{
                    fontSize: '0.85rem',
                    color: '#fff',
                    textShadow: '0 2px 6px rgba(0,0,0,0.8)',
                    marginBottom: '0.5rem'
                }}>
                    {ad.description}
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
        </li>
    );
}
function HeatmapLayer({ points }) {
    const map = useMap();

    useEffect(() => {
        if (!map || points.length === 0) return;

        // Group points by stance
        const pointsByStance = {
            "-No": [],
            "No": [],
            "Neutral": [],
            "Yes": [],
            "Yes+": []
        };

        // Count total votes
        const totalVotes = points.length;

        // Separate points by stance
        points.forEach(p => {
            if (pointsByStance[p.stance]) {
                pointsByStance[p.stance].push(p);
            }
        });

        // Create a heatmap layer for each stance
        const stanceColors = {
            "-No": "#648FFF",
            "No": "#785EF0",
            "Neutral": "#DC267F",
            "Yes": "#FE6100",
            "Yes+": "#FFB000"
        };

        Object.entries(pointsByStance).forEach(([stance, stancePoints]) => {
            if (stancePoints.length === 0) return;

            // Calculate intensity for this stance (ratio of votes for this stance)
            const stanceIntensity = stancePoints.length / totalVotes;

            // Convert to heatmap format
            const heatData = stancePoints.map(p => [
                p.lat,
                p.lng,
                stanceIntensity
            ]);

            // Create heatmap layer with stance-specific color
            const heat = L.heatLayer(heatData, {
                radius: 40,
                blur: 30,
                maxZoom: 12,
                minOpacity: 0.2,
                max: 1.0,
                gradient: {
                    0.0: stanceColors[stance],
                    0.5: stanceColors[stance],
                    1.0: stanceColors[stance]
                }
            });

            heat.addTo(map);
        });

        return () => {
            // Clean up all heatmap layers
            map.eachLayer(layer => {
                if (layer instanceof L.HeatLayer) {
                    map.removeLayer(layer);
                }
            });
        };
    }, [map, points]);

    return null;
}
export default function App() {
    // Map & user
    const [map, setMap] = useState(null);
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);

    // Pop-up Extra Text - About Us, etc.
    const [aboutText, setAboutText] = useState('');

    // Dark mode - load from localStorage on mount
    const [darkMode, setDarkMode] = useState(() => {
        const savedMode = localStorage.getItem('darkMode');
        return savedMode === 'true'; // Convert string to boolean
    });

    // About modal
    const [aboutModalOpen, setAboutModalOpen] = useState(false);

    // Location name for homebase
    const [homebaseName, setHomebaseName] = useState("Loading...");

    // Auth form fields
    const [signUpEmail, setSignUpEmail] = useState("");
    const [signUpPassword, setSignUpPassword] = useState("");
    const [loginEmail, setLoginEmail] = useState("");
    const [loginPassword, setLoginPassword] = useState("");

    // Topics + points
    const [topics, setTopics] = useState([]);
    const [heatPoints, setHeatPoints] = useState([]);
    const [twinklePoints, setTwinklePoints] = useState([]);
    const [selectedTopic, setSelectedTopic] = useState(null);

    // Filtered words
    const [hasFilteredWords, setHasFilteredWords] = useState(false);

    // Create-topic form
    const [createOpen, setCreateOpen] = useState(false);
    const [selectedPresetTitle, setSelectedPresetTitle] = useState("<< Select >>");
    const [newDescription, setNewDescription] = useState("");
    const [stance, setStance] = useState("");

    // Engage form
    const [engageStance, setEngageStance] = useState("");

    // Search filters
    const [searchText, setSearchText] = useState("");
    const [filterTitle, setFilterTitle] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [filterOpen, setFilterOpen] = useState(false);

    // Sorting
    const [sortOption, setSortOption] = useState("newest");

    // User-history spotlight
    const [userSpotlightOpen, setUserSpotlightOpen] = useState(false);
    const [userHistory, setUserHistory] = useState([]);
    const [selectedUserPoint, setSelectedUserPoint] = useState(null);

    // Pagination / infinite scroll
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const feedRef = useRef();

    // Shared Canvas renderer
    const canvasRenderer = useMemo(() => L.canvas({ padding: 0.5 }), []);
    const svgRenderer = useMemo(() => L.svg(), []);

    // Share topic consts
    const query = useQuery();
    const topicIdFromURL = query.get("topic");
    const location = useLocation();

    // Share topic query
    function useQuery() {
        return new URLSearchParams(useLocation().search);
    }

    useEffect(() => {
        async function loadSharedTopic() {
            const params = new URLSearchParams(location.search);
            const topicId = params.get("topic");

            if (!topicId) return;

            try {
                // First check if topic is already loaded
                const existing = topics.find(t => String(t.id) === String(topicId));
                if (existing) {
                    setSelectedTopic(existing);
                    // Load points for this topic
                    const res = await fetch(`${API_BASE}/points?topic_id=${encodeURIComponent(existing.id)}`);
                    if (res.ok) {
                        setHeatPoints(await res.json());
                    }
                    return;
                }

                // If not in topics list, fetch it from server
                const res = await fetch(`${API_BASE}/topics/${topicId}`);
                if (res.ok) {
                    const topic = await res.json();
                    setTopics(prev => (prev.some(t => t.id === topic.id) ? prev : [topic, ...prev]));
                    setSelectedTopic(topic);

                    // Load points for this topic
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

    useEffect(() => {
        async function tryLoadTopic() {
            if (!topicIdFromURL) return;

            // First, try to find it in already-loaded topics
            const match = topics.find(t => String(t.id) === String(topicIdFromURL));
            if (match) {
                setSelectedTopic(match);
                return;
            }

            // If not found, fetch it directly
            try {
                const res = await fetch(`${API_BASE}/topics/${topicIdFromURL}`);
                if (res.ok) {
                    const topic = await res.json();
                    setTopics(prev => (prev.some(t => t.id === topic.id) ? prev : [...prev, topic]));
                    setSelectedTopic(topic);
                } else {
                    console.warn("Topic not found or fetch failed:", res.status);
                }
            } catch (err) {
                console.error("Error fetching topic by ID:", err);
            }
        }

        tryLoadTopic();
    }, [topicIdFromURL]);

    // Apply dark mode class to body and save to localStorage
    useEffect(() => {
        if (darkMode) {
            document.body.classList.add('dark-mode');
            localStorage.setItem('darkMode', 'true');
        } else {
            document.body.classList.remove('dark-mode');
            localStorage.setItem('darkMode', 'false');
        }
    }, [darkMode]);

   // Fetch profile from Supabase
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

    // Reverse geocode coordinates to get location name
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

    // Fetch logged‐in user's history
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

    // Toggle user‐history spotlight
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

    // Deduplicate topics by ID
    const uniqueTopics = useMemo(() => {
        const m = new Map();
        topics.forEach(t => m.set(t.id, t));
        return Array.from(m.values());
    }, [topics]);

    // Filter topics
    const filteredTopics = useMemo(() => {
        let result = uniqueTopics.filter(t => {
            const matchesText = searchText
                ? t.description?.toLowerCase().includes(searchText.toLowerCase())
                : true;
            const matchesTitle = filterTitle ? t.title === filterTitle : true;
            const created = new Date(t.created_at);
            const afterStart = startDate ? created >= new Date(startDate) : true;
            const beforeEnd = endDate ? created <= new Date(endDate) : true;
            return matchesText && matchesTitle && afterStart && beforeEnd;
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
    }, [uniqueTopics, searchText, filterTitle, startDate, endDate, sortOption]);

    // Insert ads every 8 items
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

    // Sharing button
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

    // Supabase auth listener
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

    // Auth handlers
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
    const handleLogout = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
    };

    // Set homebase
    const setHomebase = () => {
        if (!user) return alert("Please sign in.");
        if (profile?.homebase_set) return alert("Homebase already set.");
        if (!navigator.geolocation) return alert("Geolocation not available.");
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
                }
            },
            (error) => {
                console.error("Geolocation error:", error);
                alert("Allow location and try again.");
            },
            { enableHighAccuracy: true }
        );
    };

    // Reset homebase (with 180-day limit)
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

    // Handle topic creation
    const handleCreateTopic = async e => {
        e.preventDefault();
        if (!user) return alert("Sign in first.");
        if (!newDescription.trim()) return alert("Description required.");
        if (!stance) return alert("Select a stance.");
        if (!profile?.homebase_set) return alert("Set homebase first.");
        if (selectedPresetTitle === "<< Select >>") return alert("Select a topic.");

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

    // Submit a vote on the selected topic
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

    // When a topic in the feed is clicked
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

    // Close the topic spotlight
    const closeSpotlight = () => {
        setSelectedTopic(null);
        setHeatPoints([]);
        setEngageStance("");
    };

    // Pagination & infinite scroll
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

    // Socket.IO real-time
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

    // Heatmap & twinkle points
    const renderPoints = useMemo(() => {
        return mergeMostRecentPerUser([], heatPoints)
            .map(p => ({
                ...p,
                lat: Number(p.lat),
                lng: Number(p.lng),
                intensity: Math.max(0, Math.min(100, Number(p.intensity) || 0)),
            }))
            .filter(p => !isNaN(p.lat) && !isNaN(p.lng) && p.stance)
            .map(p => {
                const km = 2 + (p.intensity / 100) * 18;
                return {
                    id: p.id,
                    lat: p.lat,
                    lng: p.lng,
                    radius: km * 1000,
                    color: STANCE_COLOR[p.stance] || "#666",
                    stance: p.stance,  // ADD THIS LINE - keep the original stance value
                };
            });
    }, [heatPoints]);

    useEffect(() => {
        if (!selectedTopic) {
            (async () => {
                const res = await fetch(`${API_BASE}/twinkle_points`);
                const rows = await res.json();
                setTwinklePoints(rows);
            })();
        }
    }, [selectedTopic]);

    const twinkleMarkers = useMemo(() => {
        return twinklePoints
            .map(p => {
                const km = 2 + ((Number(p.intensity) || 0) / 100) * 18;
                return {
                    id: p.id,
                    lat: Number(p.lat),
                    lng: Number(p.lng),
                    radius: km * 1000,
                    color: STANCE_COLOR[p.stance] || "#888",
                };
            })
            .filter(p => !isNaN(p.lat) && !isNaN(p.lng));
    }, [twinklePoints]);

    // Twinkle effect stuff
    useEffect(() => {
        if (!map || selectedTopic) return;

        const twinkleLayerGroup = L.layerGroup().addTo(map);

        const stanceColors = Object.values(STANCE_COLOR); // Grab your 5 defined colors

        twinkleMarkers.forEach((marker, i) => {
            const delay = (Math.random() * 2).toFixed(2);
            const duration = (1.5 + Math.random()).toFixed(2);
            const color = stanceColors[Math.floor(Math.random() * stanceColors.length)];

            const icon = L.divIcon({
                className: 'twinkle-marker',
                html: `<div class="twinkle-dot" style="
        animation-delay: ${delay}s;
        animation-duration: ${duration}s;
        background: ${color};
        box-shadow: 0 0 6px ${color};
      "></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            });

            const m = L.marker([marker.lat, marker.lng], { icon });
            m.addTo(twinkleLayerGroup);
        });

        return () => {
            map.removeLayer(twinkleLayerGroup);
        };
    }, [map, twinkleMarkers, selectedTopic]);

    useEffect(() => {
        if (!selectedTopic) {
            document
                .querySelectorAll(".leaflet-interactive.twinkle-marker")
                .forEach((el, i) => {
                    el.style.animationDelay = `${((i * 0.2) % 1.5).toFixed(2)}s`;
                });
        }
    }, [twinklePoints, selectedTopic]);

    const stancePercentages = useMemo(() => {
        const counts = { "-No": 0, No: 0, Neutral: 0, Yes: 0, "Yes+": 0 };
        heatPoints.forEach(p => {
            if (counts[p.stance] != null) counts[p.stance]++;
        });
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        return Object.fromEntries(
            Object.entries(counts).map(([s, v]) => [s, total ? Math.round((v * 100) / total) : 0])
        );
    }, [heatPoints]);

    return (
        <div className="app-root" style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
            <header className="app-header header--with-user">
                <h1
                    className="site-title"
                    onClick={() => setAboutModalOpen(true)}
                    style={{
                        fontSize: '1.2rem',
                        fontWeight: 'bold',
                        fontFamily: 'inherit',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer',
                        color: darkMode ? '#eee' : '#222',
                        transition: 'color 0.3s ease',
                        textAlign: 'center'
                    }}
                >
                    PulseVote
                </h1>
                <div className="header-right">
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
                                    onClick={() =>
                                        map.flyTo([profile.home_lat, profile.home_lng], 9, { duration: 2 })
                                    }
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
                                <span onClick={() => setAboutText(`Frequently Asked Questions:

                                1. What is PulseVote?
                                A geo-social dashboard for sharing and visualizing opinions.

                                2. Do I need an account?
                                No, but setting a homebase unlocks more features.

                                3. Can I create my own topics?
                                Yes! Just click “Create a New Topic” and start engaging.`)}>F.A.Q.</span>
                                <span onClick={() => setAboutText(`Want to advertise with us?

                                PulseVote offers interactive ad placements within topic feeds. Reach geo-targeted audiences with sponsored messages that blend seamlessly into the user experience.

                                In the future, we will offer an automated system to submit your sponsor info, message, and link. For now, please email us at: 
                                <a href="mailto:ads@pulsevote.org" style={{ color: darkMode ? '#ccc' : '#0077cc', textDecoration: 'underline' }}>
                                ads@pulsevote.org
                                </a>`)}>Advertise with Us</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="app-main" style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                <main className="map-column" style={{ flex: 1 }}>
                    <MapContainer center={[20, 0]} zoom={2} className="main-map" whenCreated={setMap} preferCanvas={true} minZoom={2} maxZoom={12}>
                        <TileLayer
                            url={darkMode
                                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                                : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            }
                            attribution={darkMode
                                ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                                : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            }
                        />
                        <MapSetter onMapReady={setMap} />

                        {selectedTopic && renderPoints.length > 0 && (
                            <HeatmapLayer points={renderPoints} />
                        )}
                        
                    </MapContainer>
                </main>

                <aside className="right-column">
                    {userSpotlightOpen ? (
                        selectedUserPoint ? (
                            <section className="spotlight-section card">
                                <button className="spotlight-close" onClick={closeUserSpotlight}>✕</button>
                                <div className="spotlight-content">
                                    <h3 className="spotlight-title">{selectedUserPoint.topic.title}</h3>
                                    <p>Your stance: <strong>{selectedUserPoint.stance}</strong></p>
                                    <p>Intensity: {selectedUserPoint.intensity} / 100</p>
                                    <p>At: {new Date(selectedUserPoint.created_at).toLocaleString()}</p>
                                </div>
                            </section>
                        ) : (
                            <section className="feed-section card" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
                                <h3 style={{ marginBottom: "0.5rem" }}>Homebase</h3>
                                <p style={{ fontSize: "1.2rem", fontWeight: "bold", margin: "0.5rem 0" }}>{homebaseName}</p>
                                {profile?.home_lat && profile?.home_lng && (
                                    <>
                                        <p style={{ fontSize: "0.9rem", color: "#666", margin: "0.5rem 0" }}>
                                            {profile.home_lat.toFixed(4)}, {profile.home_lng.toFixed(4)}
                                        </p>
                                        <button onClick={resetHomebase} style={{ marginTop: "1rem", padding: "0.5rem 1.5rem", background: "#FE6100", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.9rem", fontWeight: "bold", transition: "background 0.2s ease" }} onMouseEnter={(e) => e.target.style.background = "#E55500"} onMouseLeave={(e) => e.target.style.background = "#FE6100"}>Reset Homebase</button>
                                    </>
                                )}
                            </section>
                        )
                    ) : selectedTopic ? (
                            <section id="spotlight-section" className="spotlight-section card">
                            <button className="spotlight-close" onClick={closeSpotlight}>✕</button>
                            <div className="spotlight-content">
                                <h3 className="spotlight-title">{selectedTopic.title}</h3>
                                <p className="spotlight-count">{renderPoints.length} vote{renderPoints.length !== 1 ? "s" : ""}</p>
                                <button onClick={() => handleShare(selectedTopic.id)} className="share-button">Share</button>
                                <div className="stance-summary">
                                    {["-No", "No", "Neutral", "Yes", "Yes+"].map(s => (
                                        <div key={s} className="stance-box">
                                            <div className="stance-label">{s}</div>
                                            <div className="stance-value">{stancePercentages[s]}%</div>
                                        </div>
                                    ))}
                                </div>
                                <p className="spotlight-meta">By: <strong>{selectedTopic.created_by}</strong><br />On: {new Date(selectedTopic.created_at).toLocaleString()}</p>
                                {selectedTopic.description ? (
                                        <p className="spotlight-desc" style={{ margin: "2rem 0" }}>
                                            {selectedTopic.description.split('\n').map((line, index) => (
                                                <React.Fragment key={index}>
                                                    {line}
                                                    <br />
                                                </React.Fragment>
                                            ))}
                                        </p>
                                ) : (
                                    <p className="spotlight-desc muted" style={{ margin: "2rem 0" }}>No description provided.</p>
                                )}
                                <div className="spotlight-engage">
                                    <h4 style={{ margin: "0 0 0.5rem" }}>Engage with this Topic</h4>
                                    {!user ? (
                                        <div style={{ color: "#666", fontSize: "0.95rem" }}>Sign in and set a homebase to engage.</div>
                                    ) : (
                                        <form onSubmit={handleEngage} className="compact-form">
                                            <div className="radios" role="radiogroup">
                                                {["-No", "No", "Neutral", "Yes", "Yes+"].map(s => (
                                                    <label key={s}><input type="radio" name="engage-stance" value={s} checked={engageStance === s} onChange={e => setEngageStance(e.target.value)} style={{ accentColor: STANCE_COLOR[s] }} />{" "}{s}</label>
                                                ))}
                                            </div>
                                            <div className="stance-bar">
                                                {["-No", "No", "Neutral", "Yes", "Yes+"].map(s => (
                                                    <div key={s} className="stance-segment" style={{ backgroundColor: STANCE_COLOR[s] }} />
                                                ))}
                                            </div>
                                            <div className="engage-actions"><button type="submit" disabled={!engageStance}>Engage</button></div>
                                        </form>
                                    )}
                                </div>
                            </div>
                        </section>
                    ) : (
                        <>
                            {!user ? (
                                <section className="auth-section">
                                    <div className="auth-box card">
                                        <h3>Sign Up</h3>
                                        <form onSubmit={handleSignUp} className="compact-form">
                                            <input type="email" placeholder="Email" value={signUpEmail} onChange={e => setSignUpEmail(e.target.value)} required />
                                            <input type="password" placeholder="Password" value={signUpPassword} onChange={e => setSignUpPassword(e.target.value)} required />
                                            <button type="submit">Sign Up</button>
                                        </form>
                                    </div>
                                    <div className="auth-box card">
                                        <h3>Login</h3>
                                        <form onSubmit={handleLogin} className="compact-form">
                                            <input type="email" placeholder="Email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
                                            <input type="password" placeholder="Password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
                                            <button type="submit">Login</button>
                                        </form>
                                    </div>
                                </section>
                            ) : (
                                <>
                                    <section className="create-section card">
                                        <div className="accordion-header">
                                            <h3>Create a New Topic</h3>
                                            <button className={`accordion-toggle ${createOpen ? "open" : ""}`} onClick={() => setCreateOpen(o => !o)} aria-expanded={createOpen}>{createOpen ? "−" : "+"}</button>
                                        </div>
                                        <div className={`accordion-body ${createOpen ? "expanded" : ""}`}>
                                            <form onSubmit={handleCreateTopic} className="compact-form create-topic-form">
                                                <label>Topic</label>
                                                <select value={selectedPresetTitle} onChange={e => setSelectedPresetTitle(e.target.value)} required>
                                                    {["<< Select >>", "Agriculture and Agri-Food", "Elections", "Employment and Social Development", "Environment and Climate Change", "Entertainment", "Finance", "Fisheries and Oceans", "Global Affairs", "Health", "Heritage", "Immigration, Refugees and Citizenship", "Indigenous Services", "Infrastructure", "Innovation, Science and Economic Development", "Justice", "Local Affairs", "National Defence", "Natural Resources", "Public Safety", "Public Services and Procurement", "PulseVote - Site Suggestions", "Transport", "Veterans Affairs"].map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                                            <textarea
                                                                placeholder="Description (required)"
                                                                value={newDescription}
                                                                onChange={(e) => {
                                                                    setNewDescription(e.target.value);
                                                                    setHasFilteredWords(containsFilteredWords(e.target.value));
                                                                }}
                                                                rows={5}
                                                                required
                                                            />
                                                <div className="radios">
                                                    {["-No", "No", "Neutral", "Yes", "Yes+"].map(s => (
                                                        <label key={s}><input type="radio" name="create-stance" value={s} checked={stance === s} onChange={e => setStance(e.target.value)} style={{ accentColor: STANCE_COLOR[s] }} />{" "}{s}</label>
                                                    ))}
                                                </div>
                                                <div className="stance-bar">
                                                    {["-No", "No", "Neutral", "Yes", "Yes+"].map(s => (
                                                        <div key={s} className="stance-segment" style={{ backgroundColor: STANCE_COLOR[s] }} />
                                                    ))}
                                                </div>
                                                            <button
                                                                type="submit"
                                                                disabled={selectedPresetTitle === "<< Select >>" || hasFilteredWords}
                                                            >
                                                                Create Topic
                                                            </button>
                                            </form>
                                        </div>
                                    </section>

                                    <section className="accordion-section card">
                                        <div className="accordion-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <div style={{ flex: 1, textAlign: "center" }}><h3 style={{ margin: 0, fontWeight: "normal" }}>Filters</h3></div>
                                            <button className={`accordion-toggle ${filterOpen ? "open" : ""}`} onClick={() => setFilterOpen(o => !o)} aria-expanded={filterOpen}>{filterOpen ? "−" : "+"}</button>
                                        </div>
                                        <div className={`accordion-body ${filterOpen ? "expanded" : ""}`}>
                                            <form className="compact-form">
                                                <input type="text" placeholder="Search description..." value={searchText} onChange={e => setSearchText(e.target.value)} style={{ marginBottom: "0rem", width: "100%", height: "2.5rem", padding: "0rem" }} />
                                                <select value={filterTitle} onChange={e => setFilterTitle(e.target.value)} style={{ marginBottom: "0rem", width: "100%", height: "2.5rem", padding: "0rem" }}>
                                                    <option value="">All Titles</option>
                                                    {Array.from(new Set(topics.map(t => t.title))).map(title => (
                                                        <option key={title} value={title}>{title}</option>
                                                    ))}
                                                </select>
                                                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                                                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ flex: 1, height: "2.5rem", padding: "0.5rem" }} />
                                                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ flex: 1, height: "2.5rem", padding: "0.5rem" }} />
                                                </div>
                                                <select value={sortOption} onChange={e => setSortOption(e.target.value)} style={{ marginBottom: "0.5rem", width: "100%", height: "2.5rem", padding: "0.5rem" }}>
                                                    <option value="newest">Newest to Oldest</option>
                                                    <option value="oldest">Oldest to Newest</option>
                                                    <option value="mostVotes">Most Votes</option>
                                                    <option value="leastVotes">Least Votes</option>
                                                </select>
                                            </form>
                                        </div>
                                    </section>
                                </>
                            )}

                            <section className="feed-section card" style={{ flex: 1, padding: 0 }}>
                                <div className="feed-list" ref={feedRef} style={{ flex: 1, overflowY: "auto", padding: "0rem" }}>
                                    <ul>
                                        {topicsWithAds.map((item, index) =>
                                            item.isAd ? (
                                                <AdCard key={`ad-${item.adIndex}`} adIndex={item.adIndex} />
                                            ) : (
                                                    <li key={item.id} className="feed-item feed-item--clickable" onClick={() => handleSelectTopic(item)} role="button" tabIndex={0}>
                                                        <div className="feed-left">
                                                            <div className="feed-title">{item.title}</div>
                                                            {item.description && <div className="feed-desc">{item.description}</div>}
                                                            {item.created_at && <div className="feed-date">{new Date(item.created_at).toLocaleString()}</div>}
                                                        </div>
                                                        <div className="feed-right">
                                                            <div className="feed-votes">{item.vote_count || 0} votes</div>
                                                        </div>
                                                    </li>
                                            )
                                        )}
                                    </ul>
                                    <div id="topic-list-sentinel" style={{ height: 1 }} />
                                    {!hasMore && <p style={{ textAlign: "center", color: "#666" }}>No more topics</p>}
                                </div>
                            </section>
                        </>
                    )}
                </aside>
            </div>
        </div>
    );
}