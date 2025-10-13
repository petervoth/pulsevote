import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const STANCE_COLOR = {
  "-No": "#648FFF",
  No: "#785EF0",
  Neutral: "#DC267F",
  Yes: "#FE6100",
  "Yes+": "#FFB000",
};

function MapSetter({ onMapReady }) {
  const map = useMap();
  useEffect(() => {
    onMapReady(map);
  }, [map, onMapReady]);
  return null;
}

export default function MapView({ map, setMap, selectedTopic, heatPoints, twinklePoints }) {
  const canvasRenderer = useMemo(() => L.canvas({ padding: 0.5 }), []);
  const svgRenderer = useMemo(() => L.svg(), []);

  const renderPoints = useMemo(() => {
    return heatPoints
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
        };
      });
  }, [heatPoints]);

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
    if (!selectedTopic) {
      document
        .querySelectorAll(".leaflet-interactive.twinkle-marker")
        .forEach((el, i) => {
          el.style.animationDelay = `${((i * 0.2) % 1.5).toFixed(2)}s`;
        });
    }
  }, [twinklePoints, selectedTopic]);

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      className="main-map"
      whenCreated={setMap}
      preferCanvas={true}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapSetter onMapReady={setMap} />
      {selectedTopic
        ? renderPoints.map((m, i) => (
            <Circle
              key={`pt-${m.id}-${i}`}
              center={[m.lat, m.lng]}
              radius={m.radius}
              pathOptions={{ color: m.color, fillColor: m.color, fillOpacity: 0.6 }}
              renderer={canvasRenderer}
            />
          ))
        : twinkleMarkers.map((m, i) => (
            <Circle
              key={`tw-${m.id}-${i}`}
              center={[m.lat, m.lng]}
              radius={m.radius}
              pathOptions={{
                className: "twinkle-marker",
                color: m.color,
                fillColor: m.color,
                fillOpacity: 0.6,
              }}
              renderer={svgRenderer}
            />
          ))}
    </MapContainer>
  );
}
