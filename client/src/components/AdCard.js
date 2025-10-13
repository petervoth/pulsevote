// src/components/AdCard.js
import React from "react";

export default function AdCard() {
  return (
    <div className="ad-card">
      <img
        src="https://via.placeholder.com/280x160?text=Sponsored+Ad"
        alt="Sponsored Ad"
        style={{ width: "100%", borderRadius: "8px" }}
      />
      <p style={{ fontSize: "0.85rem", color: "#666", marginTop: "0.5rem" }}>
        Sponsored content
      </p>
    </div>
  );
}
