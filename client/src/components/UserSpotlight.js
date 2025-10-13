import React from "react";

export default function UserSpotlight({
  selectedUserPoint,
  setUserSpotlightOpen,
  setSelectedUserPoint,
}) {
  const closeUserSpotlight = () => {
    setUserSpotlightOpen(false);
    setSelectedUserPoint(null);
  };

  return selectedUserPoint ? (
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
    <section
      className="feed-section card"
      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <h3>Sponsored Vote</h3>
    </section>
  );
}
