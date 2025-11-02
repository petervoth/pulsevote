// src/MainApp.js
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "react-router-dom";
import L from "leaflet";
import "leaflet.heat";
import { MapContainer, TileLayer, Circle, useMap, GeoJSON } from "react-leaflet";
import { io } from "socket.io-client";
import { supabase } from "./supabaseClient";
import "leaflet/dist/leaflet.css";
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

// Stance weights
const stanceWeights = {
    '-No': -2,
    'No': -1,
    'Neutral': 0,
    'Yes': 1,
    'Yes+': 2,
};

// Emojis for Topic List
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

// Ad Pricing Constants
const AD_PRICING = {
    7: 35,   // 7 days = $35
    14: 60,  // 14 days = $60
    30: 100  // 30 days = $100
};

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

function AdCard({ adIndex, liveAds }) {
    // If no live ads, show placeholder
    if (liveAds.length === 0) {
        return (
            <li className="feed-item ad-card" style={{
                cursor: 'pointer',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                position: 'relative',
                overflow: 'hidden',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                padding: 0,
                height: '120px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <div style={{ color: '#666', fontSize: '0.9rem' }}>No ads available</div>
            </li>
        );
    }

    const ad = liveAds[adIndex % liveAds.length];

    return (
        <li
            className="feed-item ad-card"
            onClick={() => window.open(ad.link_url, '_blank')}
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
                src={ad.image_url}
                alt={ad.company_name}
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
                    {ad.company_name}
                </div>
                <div style={{
                    fontSize: '0.85rem',
                    color: '#fff',
                    textShadow: '0 2px 6px rgba(0,0,0,0.8)',
                    marginBottom: '0.5rem'
                }}>
                    {ad.ad_text}
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

// Utility function for AVG box color
function getAvgBoxColor(avg) {
    if (avg === "–") return "avg-neutral";
    if (avg < -1) return 'stance-no-strong';
    if (avg < -0.1) return 'stance-no';
    if (avg < 0.1) return 'stance-neutral';
    if (avg <= 1.00) return 'stance-yes';
    return 'stance-yes-strong';
}

// Generate grid-based GeoJSON for choropleth
function generateGridGeoJSON(bounds, gridSize = 5) {
    const features = [];
    const { _southWest, _northEast } = bounds;
    const latMin = _southWest.lat;
    const latMax = _northEast.lat;
    const lngMin = _southWest.lng;
    const lngMax = _northEast.lng;

    for (let lat = latMin; lat < latMax; lat += gridSize) {
        for (let lng = lngMin; lng < lngMax; lng += gridSize) {
            const cellLatMax = Math.min(lat + gridSize, latMax);
            const cellLngMax = Math.min(lng + gridSize, lngMax);

            features.push({
                type: "Feature",
                properties: {
                    id: `${lat}_${lng}`,
                    bounds: {
                        latMin: lat,
                        latMax: cellLatMax,
                        lngMin: lng,
                        lngMax: cellLngMax
                    }
                },
                geometry: {
                    type: "Polygon",
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

    return {
        type: "FeatureCollection",
        features
    };
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
                radius: 50,
                blur: 10,
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

function ChoroplethLayer({ points }) {
    const map = useMap();
    const [gridGeoJSON, setGridGeoJSON] = useState(null);
    const [mapKey, setMapKey] = useState(0);

    // Calculate grid size based on zoom level
    const getGridSizeForZoom = (zoom) => {
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
    };

    useEffect(() => {
        if (!map) return;

        const updateGrid = () => {
            const bounds = map.getBounds();
            const zoom = map.getZoom();
            const gridSize = getGridSizeForZoom(zoom);
            console.log(`Zoom: ${zoom}, Grid Size: ${gridSize}`);

            const geoJSON = generateGridGeoJSON(bounds, gridSize);
            setGridGeoJSON(geoJSON);
            setMapKey(prev => prev + 1);
        };

        updateGrid();
        map.on('moveend', updateGrid);
        map.on('zoomend', updateGrid);

        return () => {
            map.off('moveend', updateGrid);
            map.off('zoomend', updateGrid);
        };
    }, [map]);

    const calculateAvgForCell = (cellBounds) => {
        const pointsInCell = points.filter(p =>
            p.lat >= cellBounds.latMin &&
            p.lat < cellBounds.latMax &&
            p.lng >= cellBounds.lngMin &&
            p.lng < cellBounds.lngMax
        );

        if (pointsInCell.length === 0) return null;

        const totalScore = pointsInCell.reduce((sum, p) => {
            const weight = stanceWeights[p.stance] ?? 0;
            return sum + weight;
        }, 0);

        return totalScore / pointsInCell.length;
    };

    const getColorForAvg = (avg) => {
        if (avg === null) return 'transparent';
        if (avg < -1) return STANCE_COLOR["-No"];
        if (avg < -0.1) return STANCE_COLOR["No"];
        if (avg < 0.1) return STANCE_COLOR["Neutral"];
        if (avg <= 1.00) return STANCE_COLOR["Yes"];
        return STANCE_COLOR["Yes+"];
    };

    const style = (feature) => {
        const avg = calculateAvgForCell(feature.properties.bounds);
        return {
            fillColor: getColorForAvg(avg),
            fillOpacity: avg === null ? 0 : 0.6,
            color: '#666',
            weight: 1,
            opacity: 0.3
        };
    };

    const onEachFeature = (feature, layer) => {
        const avg = calculateAvgForCell(feature.properties.bounds);
        layer.on({
            click: () => {
                if (avg !== null) {
                    const popupContent = `
            <div style="text-align: center; padding: 8px;">
              <strong>Average Score</strong><br/>
              ${avg.toFixed(2)}
            </div>
          `;
                    layer.bindPopup(popupContent).openPopup();
                }
            },
            mouseover: (e) => {
                if (avg !== null) {
                    const layer = e.target;
                    layer.setStyle({
                        fillOpacity: 0.8,
                        weight: 2,
                        opacity: 0.6
                    });
                }
            },
            mouseout: (e) => {
                if (avg !== null) {
                    const layer = e.target;
                    layer.setStyle({
                        fillOpacity: 0.6,
                        weight: 1,
                        opacity: 0.3
                    });
                }
            }
        });
    };

    if (!gridGeoJSON) return null;

    return (
        <GeoJSON
            data={gridGeoJSON}
            style={style}
            onEachFeature={onEachFeature}
            key={mapKey}
        />
    );
}

function CustomChoroplethLayer({ points }) {
    const map = useMap();
    const [geoJSONData, setGeoJSONData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function loadGeoJSON() {
            try {
                const paths = [
                    '/custom.geo.json',
                    '/custom.geo',
                    `${process.env.PUBLIC_URL}/custom.geo.json`,
                    `${process.env.PUBLIC_URL}/custom.geo`
                ];

                let data = null;
                let lastError = null;

                for (const path of paths) {
                    try {
                        console.log(`Trying to fetch from: ${path}`);
                        const response = await fetch(path);
                        if (response.ok) {
                            const text = await response.text();
                            data = JSON.parse(text);
                            console.log('Successfully loaded GeoJSON from:', path);
                            break;
                        } else {
                            lastError = `HTTP ${response.status} from ${path}`;
                        }
                    } catch (err) {
                        lastError = err.message;
                        continue;
                    }
                }

                if (!data) {
                    throw new Error(`Failed to load custom GeoJSON. Last error: ${lastError}`);
                }

                setGeoJSONData(data);
                setLoading(false);
            } catch (error) {
                console.error('Error loading custom.geo:', error);
                setError(error.message);
                setLoading(false);
            }
        }

        loadGeoJSON();
    }, []);

    const calculateAvgForFeature = (feature) => {
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

        let coords = [];
        if (feature.geometry.type === 'Polygon') {
            coords = feature.geometry.coordinates[0];
        } else if (feature.geometry.type === 'MultiPolygon') {
            const pointsInFeature = points.filter(p => {
                return feature.geometry.coordinates.some(polygon => {
                    return pointInPolygon(p.lat, p.lng, polygon[0]);
                });
            });

            if (pointsInFeature.length === 0) return null;

            const totalScore = pointsInFeature.reduce((sum, p) => {
                const weight = stanceWeights[p.stance] ?? 0;
                return sum + weight;
            }, 0);

            return totalScore / pointsInFeature.length;
        }

        const pointsInFeature = points.filter(p =>
            pointInPolygon(p.lat, p.lng, coords)
        );

        if (pointsInFeature.length === 0) return null;

        const totalScore = pointsInFeature.reduce((sum, p) => {
            const weight = stanceWeights[p.stance] ?? 0;
            return sum + weight;
        }, 0);

        return totalScore / pointsInFeature.length;
    };

    const getColorForAvg = (avg) => {
        if (avg === null) return 'transparent';
        if (avg < -1) return STANCE_COLOR["-No"];
        if (avg < -0.1) return STANCE_COLOR["No"];
        if (avg < 0.1) return STANCE_COLOR["Neutral"];
        if (avg <= 1.00) return STANCE_COLOR["Yes"];
        return STANCE_COLOR["Yes+"];
    };

    const style = (feature) => {
        const avg = calculateAvgForFeature(feature);
        return {
            fillColor: getColorForAvg(avg),
            fillOpacity: avg === null ? 0 : 0.6,
            color: '#666',
            weight: 1,
            opacity: 0.5
        };
    };

    const onEachFeature = (feature, layer) => {
        const avg = calculateAvgForFeature(feature);
        layer.on({
            click: () => {
                const name = feature.properties?.name || feature.properties?.NAME || 'Region';
                const popupContent = `
          <div style="text-align: center; padding: 8px;">
            <strong>${name}</strong><br/>
            ${avg !== null ? `Average Score: ${avg.toFixed(2)}` : 'No data'}
          </div>
        `;
                layer.bindPopup(popupContent).openPopup();
            },
            mouseover: (e) => {
                if (avg !== null) {
                    const layer = e.target;
                    layer.setStyle({
                        fillOpacity: 0.8,
                        weight: 2,
                        opacity: 0.8
                    });
                }
            },
            mouseout: (e) => {
                if (avg !== null) {
                    const layer = e.target;
                    layer.setStyle({
                        fillOpacity: 0.6,
                        weight: 1,
                        opacity: 0.5
                    });
                }
            }
        });
    };

    if (loading) {
        return (
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 1000,
                background: 'white',
                padding: '1rem',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
            }}>
                Loading map data...
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 1000,
                background: '#fee',
                color: '#c00',
                padding: '1rem',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                maxWidth: '400px'
            }}>
                <strong>Error loading map:</strong><br />
                {error}
                <br /><br />
                <small>Make sure custom.geo.json is in the /public folder</small>
            </div>
        );
    }

    if (!geoJSONData) {
        return null;
    }

    return (
        <GeoJSON
            data={geoJSONData}
            style={style}
            onEachFeature={onEachFeature}
        />
    );
}

// Image validation function
const validateImage = (file) => {
    return new Promise((resolve, reject) => {
        // Check file size (max 5MB)
        const maxSize = 5 * 1024 * 1024; // 5MB in bytes
        if (file.size > maxSize) {
            reject('Image must be less than 5MB');
            return;
        }

        // Check file type
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            reject('Image must be JPG, PNG, or WebP format');
            return;
        }

        // Check dimensions
        const img = new Image();
        img.onload = () => {
            const width = img.width;
            const height = img.height;

            // Require exact or larger dimensions (we can crop/resize later)
            // Target: 280x60 (maintains aspect ratio of 4.67:1)
            const minWidth = 280;
            const minHeight = 60;
            const aspectRatio = width / height;
            const targetAspectRatio = 4.67;

            if (width < minWidth || height < minHeight) {
                reject(`Image must be at least ${minWidth}x${minHeight} pixels`);
                return;
            }

            // Allow some flexibility in aspect ratio (±0.1)
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

// Stripe Checkout Form Component
function CheckoutForm({ adFormData, validateForm, onSuccess, onError, darkMode }) {
    const stripe = useStripe();
    const elements = useElements();
    const [processing, setProcessing] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        event.stopPropagation();

        console.log('Submit clicked - validating form first...');

        // CRITICAL: Validate FIRST before anything else
        if (!validateForm || typeof validateForm !== 'function') {
            console.error('validateForm function not provided!');
            alert('Form validation error. Please refresh and try again.');
            return;
        }

        const isValid = validateForm();
        console.log('Form validation result:', isValid);

        if (!isValid) {
            console.log('Form validation failed - stopping here');
            // Don't process payment, validation errors should now be visible
            return;
        }

        if (!stripe || !elements) {
            console.error('Stripe not loaded');
            alert('Payment system not ready. Please refresh and try again.');
            return;
        }

        setProcessing(true);
        console.log('Starting payment process...');

        try {
            // Step 1: Create payment intent on server
            console.log('Creating payment intent...');
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
                console.error('Payment intent failed:', errorText);
                throw new Error(`Failed to create payment intent: ${errorText}`);
            }

            const { clientSecret, paymentIntentId } = await intentResponse.json();
            console.log('Payment intent created:', paymentIntentId);

            // Step 2: Confirm payment with Stripe
            console.log('Confirming card payment...');
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
                console.error('Stripe error:', error);
                onError(error.message);
                setProcessing(false);
                return;
            }

            console.log('Payment status:', paymentIntent.status);

            if (paymentIntent.status === 'requires_capture') {
                console.log('Payment authorized! Submitting ad...');
                await onSuccess(paymentIntentId);
                console.log('Ad submission complete!');
            } else {
                throw new Error(`Unexpected payment status: ${paymentIntent.status}`);
            }
        } catch (err) {
            console.error('Error in payment process:', err);
            onError(err.message || 'Payment processing failed');
            setProcessing(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Card Details Section */}
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

            {/* Submit Button */}
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

export default function MainApp() {
    // Map & user
    const mapRef = useRef(null);
    const [map, setMap] = useState(null);
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);

    // Expander for mobile
    const [mapExpanded, setMapExpanded] = useState(false);

    // Map visualization options
    const [mapOptionsOpen, setMapOptionsOpen] = useState(false);
    const [showHeatmap, setShowHeatmap] = useState(true);
    const [showTwinkles, setShowTwinkles] = useState(true);
    const [selectedMapStyle, setSelectedMapStyle] = useState("heatmap");

    // Pop-up Extra Text - About Us, etc.
    const [aboutText, setAboutText] = useState('');

    // Dark mode - load from localStorage on mount
    const [darkMode, setDarkMode] = useState(() => {
        const savedMode = localStorage.getItem('darkMode');
        return savedMode === 'true';
    });

    // About modal
    const [aboutModalOpen, setAboutModalOpen] = useState(false);

    // Ad submission modal state
    const [adSubmissionOpen, setAdSubmissionOpen] = useState(false);
    const [adFormData, setAdFormData] = useState({
        companyName: '',
        adText: '',
        linkUrl: '',
        email: '',
        duration: 7, // default 7 days
        startDate: '',
        imageFile: null,
        imagePreview: null
    });
    const [adFormErrors, setAdFormErrors] = useState({});
    const [adFormSubmitting, setAdFormSubmitting] = useState(false);

    // Live Ads State - replaces hardcoded AD_DATA from back-up copy
    const [liveAds, setLiveAds] = useState([]);

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

    // Listener that updates whenever the map moves or zooms
    const [useMapView, setUseMapView] = useState(true);
    const [visibleBounds, setVisibleBounds] = useState(null);

    // Ad form handlers
    const handleAdFormChange = (field, value) => {
        setAdFormData(prev => ({
            ...prev,
            [field]: value
        }));

        // Clear error for this field when user types
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

            // Create preview URL
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
            e.target.value = ''; // Reset file input
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
            // Basic URL validation
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
        console.log('handleAdSubmit called with paymentIntentId:', paymentIntentId);
        setAdFormSubmitting(true);

        try {
            // Create FormData for file upload
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

            console.log('Submitting ad with data:', {
                companyName: adFormData.companyName,
                email: adFormData.email,
                duration: adFormData.duration,
                amount: AD_PRICING[adFormData.duration],
                paymentIntentId: paymentIntentId
            });

            const response = await fetch(`${API_BASE}/api/ad-submissions`, {
                method: 'POST',
                body: formData
            });

            console.log('Response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server error:', errorText);
                throw new Error(`Failed to submit ad: ${errorText}`);
            }

            const result = await response.json();
            console.log('Ad submitted successfully:', result);

            // Success! Show confirmation
            alert(`Thank you! Your ad submission has been received. We'll review it and contact you at ${adFormData.email} within 24 hours.\n\nSubmission ID: ${result.id}`);

            // Reset form
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
            console.error('Error submitting ad:', error);
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

    useEffect(() => {
        if (!map || typeof map.getBounds !== 'function') return;

        const handleMove = () => {
            setVisibleBounds(map.getBounds());
        };

        map.on('moveend', handleMove);
        setVisibleBounds(map.getBounds());

        return () => {
            map.off('moveend', handleMove);
        };
    }, [map]);

    // ===== NEW: Force map to reload tiles and invalidate size =====
    useEffect(() => {
        if (!map) return;

        // Invalidate size when map becomes available
        setTimeout(() => {
            map.invalidateSize();
        }, 100);

        // Add event listeners for various scenarios that might cause tile loading issues
        const handleResize = () => {
            map.invalidateSize();
        };

        const handleOrientationChange = () => {
            setTimeout(() => {
                map.invalidateSize();
            }, 200);
        };

        // Listen for window resize
        window.addEventListener('resize', handleResize);

        // Listen for orientation changes (mobile)
        window.addEventListener('orientationchange', handleOrientationChange);

        // Also invalidate when the map moves or zooms
        map.on('moveend', () => {
            map.invalidateSize();
        });

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleOrientationChange);
            map.off('moveend');
        };
    }, [map]);

    // ===== Handle spotlight toggle specifically =====
    useEffect(() => {
        if (!map) return;

        // When mapExpanded state changes, invalidate map size after animation completes
        const timer = setTimeout(() => {
            map.invalidateSize();
        }, 350);

        return () => clearTimeout(timer);
    }, [map, mapExpanded]);

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

    useEffect(() => {
        async function tryLoadTopic() {
            if (!topicIdFromURL) return;

            const match = topics.find(t => String(t.id) === String(topicIdFromURL));
            if (match) {
                setSelectedTopic(match);
                return;
            }

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

    useEffect(() => {
        if (darkMode) {
            document.body.classList.add('dark-mode');
            localStorage.setItem('darkMode', 'true');
        } else {
            document.body.classList.remove('dark-mode');
            localStorage.setItem('darkMode', 'false');
        }
    }, [darkMode]);

    // ===== FETCH LIVE ADS FROM DATABASE =====
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
        // Refresh ads every 5 minutes
        const interval = setInterval(fetchLiveAds, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

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

        // SHOW SAFETY WARNING FIRST - before requesting location
        const confirmed = window.confirm(
            "⚠️ PRIVACY & SAFETY REMINDER\n\n" +
            "Think carefully about where you set your homebase.\n\n" +
            "For your safety, it's recommended to set your homebase at a public space NEAR your home (like a park, library, coffee shop, or gas station) instead of your actual home address.\n\n" +
            "This helps protect your privacy while still representing your local area.\n\n" +
            "Click OK to proceed and allow location access, or Cancel to abort."
        );

        // If user clicked Cancel, stop here
        if (!confirmed) {
            return;
        }

        // Only NOW request location after they confirmed
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
                    stance: p.stance,
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

    useEffect(() => {
        if (!map || selectedTopic) return;

        const twinkleLayerGroup = L.layerGroup().addTo(map);
        const stanceColors = Object.values(STANCE_COLOR);

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
                        color: darkMode ? '#eee' : '#eee',
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
                                <span onClick={() => setAboutText(
                                    <div>
                                        <p><strong>Frequently Asked Questions:</strong></p>
                                        <p>1. <strong>What is PulseVote?</strong><br />
                                            A geo-social dashboard for sharing and visualizing opinions.</p>
                                        <p>2. <strong>Do I need an account?</strong><br />
                                            No, but setting a homebase unlocks more features.</p>
                                        <p>3. <strong>Can I create my own topics?</strong><br />
                                            Yes! Just click "Create a New Topic" and start engaging.</p>
                                        <p>4. <strong>Are there any limitations when making a topic?</strong><br />
                                            Yes. Though moderation is very minimal on the site, certain words have been blocked to improve the user experience on PulseVote. You are also limited to creating only 1 voting topic in a 24 hour period to reduce spam.</p>
                                        <p>5. <strong>Are there any limitations when voting?</strong><br />
                                            No! Return to a topic and change your vote as often as you would like. For user-safety, there is no accessible voting history so your most recent selection is always included in the live results.</p>
                                        <p>6. <strong>Are these votes legally binding or used anywhere?</strong><br />
                                            Not yet. In a perfect world, we would trust our police forces to always protect us from any encroachment on our personal freedoms. This in turn would allow us to trust a public voting system without fear of repercussions, harassment, or assault. For now, PulseVote is a thought-experiment to give the world a voice and to show everyone there are more of us than you think. You deserve to take part in specific vote topics, not just electing the leaders who decide for you but keep letting you down term after term.</p>
                                        <p>7. <strong>Who runs PulseVote?</strong><br />
                                            A lone Canadian data scientist has built this site and runs everything independently, there is no "big government" behind this project. Please be patient with him. If you want to suggest improvements to PulseVote, please use the 'PulseVote' voting topic. And in true Canadian fashion, if you find something with the site is broken, sorry in advance!</p>
                                    </div>
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

            {/* Ad Submission Modal */}
            {adSubmissionOpen && (
                <div className="modal-overlay" onClick={() => resetAdForm()}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
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
                                {/* Company Name */}
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
                                            border: `1px solid ${adFormErrors.companyName ? '#dc3545' : '#ddd'}`,
                                            fontSize: '1rem',
                                            backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                            color: darkMode ? '#e0e0e0' : '#333'
                                        }}
                                    />
                                    {adFormErrors.companyName && (
                                        <span style={{ color: '#dc3545', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                                            {adFormErrors.companyName}
                                        </span>
                                    )}
                                </div>

                                {/* Ad Text */}
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
                                            border: `1px solid ${adFormErrors.adText ? '#dc3545' : '#ddd'}`,
                                            fontSize: '1rem',
                                            resize: 'vertical',
                                            backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                            color: darkMode ? '#e0e0e0' : '#333',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                    {adFormErrors.adText && (
                                        <span style={{ color: '#dc3545', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                                            {adFormErrors.adText}
                                        </span>
                                    )}
                                </div>

                                {/* Link URL */}
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
                                            border: `1px solid ${adFormErrors.linkUrl ? '#dc3545' : '#ddd'}`,
                                            fontSize: '1rem',
                                            backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                            color: darkMode ? '#e0e0e0' : '#333'
                                        }}
                                    />
                                    {adFormErrors.linkUrl && (
                                        <span style={{ color: '#dc3545', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                                            {adFormErrors.linkUrl}
                                        </span>
                                    )}
                                </div>

                                {/* Contact Email */}
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
                                            border: `1px solid ${adFormErrors.email ? '#dc3545' : '#ddd'}`,
                                            fontSize: '1rem',
                                            backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                            color: darkMode ? '#e0e0e0' : '#333'
                                        }}
                                    />
                                    {adFormErrors.email && (
                                        <span style={{ color: '#dc3545', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                                            {adFormErrors.email}
                                        </span>
                                    )}
                                    <p style={{
                                        fontSize: '0.8rem',
                                        color: darkMode ? '#999' : '#666',
                                        marginTop: '0.25rem'
                                    }}>
                                        We'll use this to contact you about your ad approval and payment.
                                    </p>
                                </div>

                                {/* Image Upload */}
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
                                            border: `1px solid ${adFormErrors.image ? '#dc3545' : '#ddd'}`,
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

                                {/* Start Date */}
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
                                            border: `1px solid ${adFormErrors.startDate ? '#dc3545' : '#ddd'}`,
                                            fontSize: '1rem',
                                            backgroundColor: darkMode ? '#2d2d2d' : '#fff',
                                            color: darkMode ? '#e0e0e0' : '#333',
                                            cursor: 'pointer'
                                        }}
                                    />
                                    {adFormErrors.startDate && (
                                        <span style={{
                                            color: '#dc3545',
                                            fontSize: '0.85rem',
                                            marginTop: '0.25rem',
                                            display: 'block'
                                        }}>
                                            {adFormErrors.startDate}
                                        </span>
                                    )}
                                    <p style={{
                                        fontSize: '0.8rem',
                                        color: darkMode ? '#999' : '#666',
                                        marginTop: '0.25rem'
                                    }}>
                                        Your ad will begin running on this date after approval
                                    </p>
                                </div>

                                {/* Duration Selection */}
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
                                                    border: `2px solid ${adFormData.duration === days ? '#0b63a4' : '#ddd'}`,
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    textAlign: 'center',
                                                    backgroundColor: adFormData.duration === days
                                                        ? (darkMode ? '#1a3a52' : '#e3f2fd')
                                                        : (darkMode ? '#2d2d2d' : '#fff'),
                                                    transition: 'all 0.2s ease'
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (adFormData.duration !== days) {
                                                        e.currentTarget.style.borderColor = '#0b63a4';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (adFormData.duration !== days) {
                                                        e.currentTarget.style.borderColor = '#ddd';
                                                    }
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

                                {/* Live Ad Preview */}
                                {adFormData.imagePreview && adFormData.adText && (
                                    <div>
                                        <label style={{
                                            display: 'block',
                                            marginBottom: '0.5rem',
                                            fontWeight: '600',
                                            color: darkMode ? '#e0e0e0' : '#333'
                                        }}>
                                            How Your Ad Will Appear:
                                        </label>
                                        <div
                                            style={{
                                                cursor: 'default',
                                                border: '2px solid rgba(255, 255, 255, 0.3)',
                                                position: 'relative',
                                                overflow: 'hidden',
                                                padding: 0,
                                                height: '120px',
                                                borderRadius: '8px'
                                            }}
                                        >
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

                                {/* Summary */}
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
                                    <p style={{
                                        fontSize: '0.8rem',
                                        marginTop: '0.5rem',
                                        color: darkMode ? '#ccc' : '#666'
                                    }}>
                                        Payment will be processed after your ad is reviewed and approved.
                                    </p>
                                </div>

                                {/* Stripe Payment Section */}
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
                                    By submitting, you agree to our advertising terms and conditions.
                                    We'll review your ad within 24 hours and contact you at the email provided.
                                </p>
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
                            <div className="map-style-options">
                                <div
                                    className={`map-style-card ${selectedMapStyle === "heatmap" ? "selected" : ""}`}
                                    onClick={() => setSelectedMapStyle("heatmap")}
                                >
                                    <img src="/images/heatmap-icon.png" alt="Heatmap" />
                                    <span>Heatmap</span>
                                </div>
                                <div
                                    className={`map-style-card ${selectedMapStyle === "choropleth" ? "selected" : ""}`}
                                    onClick={() => setSelectedMapStyle("choropleth")}
                                >
                                    <img src="/images/choropleth-icon.png" alt="Choropleth" />
                                    <span>Grid Choropleth</span>
                                </div>
                                <div
                                    className={`map-style-card ${selectedMapStyle === "custom-choropleth" ? "selected" : ""}`}
                                    onClick={() => setSelectedMapStyle("custom-choropleth")}
                                >
                                    <img src="/images/custom-choropleth-icon.png" alt="Custom Choropleth" />
                                    <span>Regional Choropleth</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="app-main" style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                <main className="map-column" style={{ flex: 1 }}>
                    <MapContainer
                        center={[20, 0]}
                        zoom={2}
                        className="main-map"
                        whenCreated={mapInstance => mapRef.current = mapInstance}
                        preferCanvas={true}
                        minZoom={2}
                        maxZoom={12}
                    >
                        <TileLayer
                            url={darkMode
                                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                                : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            }
                            attribution={darkMode
                                ? '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'
                                : '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            }
                            keepBuffer={2}
                            updateWhenIdle={false}
                            updateWhenZooming={true}
                            updateInterval={100}
                        />

                        <MapSetter onMapReady={setMap} />

                        {selectedTopic && filteredPoints.length > 0 && selectedMapStyle === "heatmap" && (
                            <HeatmapLayer points={renderPoints} />
                        )}

                        {selectedTopic && filteredPoints.length > 0 && selectedMapStyle === "choropleth" && (
                            <ChoroplethLayer points={heatPoints} />
                        )}

                        {selectedTopic && filteredPoints.length > 0 && selectedMapStyle === "custom-choropleth" && (
                            <CustomChoroplethLayer points={heatPoints} />
                        )}
                    </MapContainer>
                </main>

                <aside className="right-column">
                    {userSpotlightOpen ? (
                        selectedUserPoint ? (
                            <section className="spotlight-section card">
                                <button className="spotlight-close" onClick={closeUserSpotlight}>✕</button>
                                <div className="spotlight-content">
                                    <h3 className="spotlight-title">
                                        {topicIcons[selectedTopic.title] || ''} {selectedTopic.title}
                                    </h3>
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
                                        <button
                                            onClick={resetHomebase}
                                            style={{
                                                marginTop: "1rem",
                                                padding: "0.5rem 1.5rem",
                                                background: "#FE6100",
                                                color: "white",
                                                border: "none",
                                                borderRadius: "6px",
                                                cursor: "pointer",
                                                fontSize: "0.9rem",
                                                fontWeight: "bold",
                                                transition: "background 0.2s ease"
                                            }}
                                            onMouseEnter={(e) => e.target.style.background = "#E55500"}
                                            onMouseLeave={(e) => e.target.style.background = "#FE6100"}
                                        >
                                            Reset Homebase
                                        </button>
                                    </>
                                )}
                            </section>
                        )
                    ) : selectedTopic ? (
                        <section id="spotlight-section" className={`spotlight-section card ${mapExpanded ? 'spotlight-minimized' : ''}`}>
                            <button className="spotlight-close" onClick={closeSpotlight}>✕</button>
                            <div className="spotlight-content">
                                <h3 className="spotlight-title">
                                    {topicIcons[selectedTopic.title] || ''} {selectedTopic.title}
                                </h3>
                                <p className="spotlight-count">
                                    {filteredPoints.length} of {heatPoints.length} votes visible
                                </p>
                                <button onClick={() => handleShare(selectedTopic.id)} className="share-button">Share</button>

                                <div className="stance-summary">
                                    {["-No", "No", "Neutral", "Yes", "Yes+"].map(s => (
                                        <div key={s} className="stance-box">
                                            <div className="stance-label">{s}</div>
                                            <div className="stance-value">{stancePercentages[s]}%</div>
                                        </div>
                                    ))}
                                    <div className={`stance-box ${getAvgBoxColor(avgStanceScore)}`}>
                                        <div className="stance-label">AVG</div>
                                        <div className="stance-value">{avgStanceScore}</div>
                                    </div>
                                </div>

                                <p className="spotlight-meta">
                                    By: <strong>{selectedTopic.created_by}</strong><br />
                                    On: {new Date(selectedTopic.created_at).toLocaleString()}
                                </p>

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
                                                    <label key={s}>
                                                        <input
                                                            type="radio"
                                                            name="engage-stance"
                                                            value={s}
                                                            checked={engageStance === s}
                                                            onChange={e => setEngageStance(e.target.value)}
                                                            style={{ accentColor: STANCE_COLOR[s] }}
                                                        />
                                                        {" "}{s}
                                                    </label>
                                                ))}
                                            </div>
                                            <div className="stance-bar">
                                                {["-No", "No", "Neutral", "Yes", "Yes+"].map(s => (
                                                    <div
                                                        key={s}
                                                        className="stance-segment"
                                                        style={{ backgroundColor: STANCE_COLOR[s] }}
                                                    />
                                                ))}
                                            </div>
                                            <div className="engage-actions">
                                                <button type="submit" disabled={!engageStance}>Engage</button>
                                            </div>
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
                                            <input
                                                type="email"
                                                placeholder="Email"
                                                value={signUpEmail}
                                                onChange={e => setSignUpEmail(e.target.value)}
                                                required
                                            />
                                            <input
                                                type="password"
                                                placeholder="Password"
                                                value={signUpPassword}
                                                onChange={e => setSignUpPassword(e.target.value)}
                                                required
                                            />
                                            <button type="submit">Sign Up</button>
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

                                            {/* Google Button */}
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
                                                    justifyContent: "center",
                                                    transition: "all 0.2s ease",
                                                    flexShrink: 0
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.transform = "translateY(-3px)";
                                                    e.currentTarget.style.boxShadow = "0 6px 12px rgba(0,0,0,0.15)";
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.transform = "translateY(0)";
                                                    e.currentTarget.style.boxShadow = "none";
                                                }}
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24">
                                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                </svg>
                                            </button>

                                            {/* Discord Button */}
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
                                                    justifyContent: "center",
                                                    transition: "all 0.2s ease",
                                                    flexShrink: 0
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = "#4752C4";
                                                    e.currentTarget.style.transform = "translateY(-3px)";
                                                    e.currentTarget.style.boxShadow = "0 6px 12px rgba(88,101,242,0.4)";
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = "#5865F2";
                                                    e.currentTarget.style.transform = "translateY(0)";
                                                    e.currentTarget.style.boxShadow = "none";
                                                }}
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="auth-box card">
                                        <h3>Login</h3>
                                        <form onSubmit={handleLogin} className="compact-form">
                                            <input
                                                type="email"
                                                placeholder="Email"
                                                value={loginEmail}
                                                onChange={e => setLoginEmail(e.target.value)}
                                                required
                                            />
                                            <input
                                                type="password"
                                                placeholder="Password"
                                                value={loginPassword}
                                                onChange={e => setLoginPassword(e.target.value)}
                                                required
                                            />
                                            <button type="submit">Login</button>
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

                                            {/* Google Button */}
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
                                                    justifyContent: "center",
                                                    transition: "all 0.2s ease",
                                                    flexShrink: 0
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.transform = "translateY(-3px)";
                                                    e.currentTarget.style.boxShadow = "0 6px 12px rgba(0,0,0,0.15)";
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.transform = "translateY(0)";
                                                    e.currentTarget.style.boxShadow = "none";
                                                }}
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24">
                                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                </svg>
                                            </button>

                                            {/* Discord Button */}
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
                                                    justifyContent: "center",
                                                    transition: "all 0.2s ease",
                                                    flexShrink: 0
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = "#4752C4";
                                                    e.currentTarget.style.transform = "translateY(-3px)";
                                                    e.currentTarget.style.boxShadow = "0 6px 12px rgba(88,101,242,0.4)";
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = "#5865F2";
                                                    e.currentTarget.style.transform = "translateY(0)";
                                                    e.currentTarget.style.boxShadow = "none";
                                                }}
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </section>
                            ) : (
                                <>
                                    <section className="create-section card">
                                        <div className="accordion-header">
                                            <h3>Create a New Topic</h3>
                                            <button
                                                className={`accordion-toggle ${createOpen ? "open" : ""}`}
                                                onClick={() => setCreateOpen(o => !o)}
                                                aria-expanded={createOpen}
                                            >
                                                {createOpen ? "−" : "+"}
                                            </button>
                                        </div>

                                        <div className={`accordion-body ${createOpen ? "expanded" : ""}`}>
                                            <form onSubmit={handleCreateTopic} className="compact-form create-topic-form">
                                                <label>Topic</label>
                                                <select
                                                    value={selectedPresetTitle}
                                                    onChange={e => setSelectedPresetTitle(e.target.value)}
                                                    required
                                                >
                                                    {[
                                                        { label: "<< Select >>", value: "<< Select >>" },
                                                        { label: "🌾 Agriculture and Agri-Food", value: "Agriculture and Agri-Food" },
                                                        { label: "🗳️ Elections", value: "Elections" },
                                                        { label: "💼 Employment and Social Development", value: "Employment and Social Development" },
                                                        { label: "🌱 Environment and Climate Change", value: "Environment and Climate Change" },
                                                        { label: "🎭 Entertainment", value: "Entertainment" },
                                                        { label: "💰 Finance", value: "Finance" },
                                                        { label: "🐟 Fisheries and Oceans", value: "Fisheries and Oceans" },
                                                        { label: "🌍 Global Affairs", value: "Global Affairs" },
                                                        { label: "🏥 Health", value: "Health" },
                                                        { label: "🏛️ Heritage", value: "Heritage" },
                                                        { label: "🛂 Immigration, Refugees and Citizenship", value: "Immigration, Refugees and Citizenship" },
                                                        { label: "🧑‍🤝‍🧑 Indigenous Services", value: "Indigenous Services" },
                                                        { label: "🏗️ Infrastructure", value: "Infrastructure" },
                                                        { label: "🔬 Innovation, Science and Economic Development", value: "Innovation, Science and Economic Development" },
                                                        { label: "⚖️ Justice", value: "Justice" },
                                                        { label: "🏘️ Local Affairs", value: "Local Affairs" },
                                                        { label: "🛡️ National Defence", value: "National Defence" },
                                                        { label: "⛏️ Natural Resources", value: "Natural Resources" },
                                                        { label: "🚨 Public Safety", value: "Public Safety" },
                                                        { label: "📦 Public Services and Procurement", value: "Public Services and Procurement" },
                                                        { label: "💡 PulseVote - Site Suggestions", value: "PulseVote - Site Suggestions" },
                                                        { label: "🚗 Transport", value: "Transport" },
                                                        { label: "🎖️ Veterans Affairs", value: "Veterans Affairs" }
                                                    ].map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </select>

                                                <textarea
                                                    placeholder={`Topic (required)\n\nDescription\n\n2000 character limit`}
                                                    maxLength={2000}
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
                                                        <label key={s}>
                                                            <input
                                                                type="radio"
                                                                name="create-stance"
                                                                value={s}
                                                                checked={stance === s}
                                                                onChange={e => setStance(e.target.value)}
                                                                style={{ accentColor: STANCE_COLOR[s] }}
                                                            />
                                                            {" "}{s}
                                                        </label>
                                                    ))}
                                                </div>

                                                <div className="stance-bar">
                                                    {["-No", "No", "Neutral", "Yes", "Yes+"].map(s => (
                                                        <div
                                                            key={s}
                                                            className="stance-segment"
                                                            style={{ backgroundColor: STANCE_COLOR[s] }}
                                                        />
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

                                    <section className="create-section card">
                                        <div className="accordion-header">
                                            <h3>Filters</h3>
                                            <button
                                                className={`accordion-toggle ${filterOpen ? "open" : ""}`}
                                                onClick={() => setFilterOpen(o => !o)}
                                                aria-expanded={filterOpen}
                                            >
                                                {filterOpen ? "−" : "+"}
                                            </button>
                                        </div>

                                        <div className={`accordion-body ${filterOpen ? "expanded" : ""}`}>
                                            <form className="compact-form">
                                                <input
                                                    type="text"
                                                    placeholder="Search description..."
                                                    value={searchText}
                                                    onChange={e => setSearchText(e.target.value)}
                                                    style={{ marginBottom: "0rem", width: "100%", height: "2.5rem", padding: "0rem" }}
                                                />

                                                <select
                                                    value={filterTitle}
                                                    onChange={e => setFilterTitle(e.target.value)}
                                                    style={{ marginBottom: "0rem", width: "100%", height: "2.5rem", padding: "0rem" }}
                                                >
                                                    <option value="">All Titles</option>
                                                    {Array.from(new Set(topics.map(t => t.title))).map(title => (
                                                        <option key={title} value={title}>{title}</option>
                                                    ))}
                                                </select>

                                                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                                                    <input
                                                        type="date"
                                                        value={startDate}
                                                        onChange={e => setStartDate(e.target.value)}
                                                        style={{ flex: 1, height: "2.5rem", padding: "0.5rem" }}
                                                    />
                                                    <input
                                                        type="date"
                                                        value={endDate}
                                                        onChange={e => setEndDate(e.target.value)}
                                                        style={{ flex: 1, height: "2.5rem", padding: "0.5rem" }}
                                                    />
                                                </div>

                                                <select
                                                    value={sortOption}
                                                    onChange={e => setSortOption(e.target.value)}
                                                    style={{ marginBottom: "0.5rem", width: "100%", height: "2.5rem", padding: "0.5rem" }}
                                                >
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
                                                <AdCard key={`ad-${index}`} adIndex={item.adIndex} liveAds={liveAds} />
                                            ) : (
                                                <li
                                                    key={item.id}
                                                    className="feed-item feed-item--clickable"
                                                    onClick={() => handleSelectTopic(item)}
                                                    role="button"
                                                    tabIndex={0}
                                                >
                                                    <div className="feed-left">
                                                        <div className="feed-title">
                                                            <span className="topic-icon">{topicIcons[item.title] || ''}</span>
                                                            <span>{item.title}</span>
                                                        </div>
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