import React, { useMemo } from "react";

const STANCE_COLOR = {
  "-No": "#648FFF",
  No: "#785EF0",
  Neutral: "#DC267F",
  Yes: "#FE6100",
  "Yes+": "#FFB000",
};

export default function TopicSpotlight({
  user,
  profile,
  selectedTopic,
  heatPoints,
  setHeatPoints,
  setSelectedTopic,
}) {
  const engageStance = "";
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

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/?topic=${selectedTopic.id}`;
    if (navigator.share) {
      navigator.share({ title: "Check out this topic on PulseVote", url: shareUrl });
    } else {
      navigator.clipboard.writeText(shareUrl)
        .then(() => alert("Link copied to clipboard!"))
        .catch(() => alert("Failed to copy link."));
    }
  };

  const closeSpotlight = () => {
    setSelectedTopic(null);
    setHeatPoints([]);
  };

  return (
    <section className="spotlight-section card">
      <button className="spotlight-close" onClick={closeSpotlight}>✕</button>
      <div className="spotlight-content">
        <h3 className="spotlight-title">{selectedTopic.title}</h3>
        <p className="spotlight-count">
          {heatPoints.length} vote{heatPoints.length !== 1 ? "s" : ""}
        </p>
        <button onClick={handleShare} className="share-button">Share</button>
        <div className="stance-summary">
          {["-No", "No", "Neutral", "Yes", "Yes+"].map(s => (
            <div key={s} className="stance-box">
              <div className="stance-label">{s}</div>
              <div className="stance-value">{stancePercentages[s]}%</div>
            </div>
          ))}
        </div>
        <p className="spotlight-meta">
          By: <strong>{selectedTopic.created_by}</strong><br />
          On: {new Date(selectedTopic.created_at).toLocaleString()}
        </p>
        {selectedTopic.description ? (
          <p className="spotlight-desc" style={{ margin: "2rem 0" }}>
            {selectedTopic.description}
          </p>
        ) : (
          <p className="spotlight-desc muted" style={{ margin: "2rem 0" }}>
            No description provided.
          </p>
        )}
        <div className="spotlight-engage">
          <h4 style={{ margin: "0 0 0.5rem" }}>Engage with this Topic</h4>
          {!user ? (
            <div style={{ color: "#666", fontSize: "0.95rem" }}>
              Sign in and set a homebase to engage.
            </div>
          ) : (
            <form className="compact-form">
              <div className="radios" role="radiogroup">
                {["-No", "No", "Neutral", "Yes", "Yes+"].map(s => (
                  <label key={s}>
                    <input
                      type="radio"
                      name="engage-stance"
                      value={s}
                      style={{ accentColor: STANCE_COLOR[s] }}
                    />{" "}
                    {s}
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
                <button type="submit">Engage</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
