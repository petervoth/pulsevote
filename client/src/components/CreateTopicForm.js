import React, { useState } from "react";

const STANCE_COLOR = {
  "-No": "#648FFF",
  No: "#785EF0",
  Neutral: "#DC267F",
  Yes: "#FE6100",
  "Yes+": "#FFB000",
};

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000";

export default function CreateTopicForm({ user, profile, setTopics, setHeatPoints }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPresetTitle, setSelectedPresetTitle] = useState("<< Select >>");
  const [newDescription, setNewDescription] = useState("");
  const [stance, setStance] = useState("");

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
    const saved = await res.json();
    if (!res.ok) {
      console.error("Create topic failed:", saved);
      return alert("Could not create topic.");
    }

    await fetch(`${API_BASE}/points`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic_id: saved.id,
        user_id: user.id,
        stance,
        intensity: 35,
        lat: profile.home_lat,
        lng: profile.home_lng,
      }),
    });

    setTopics(prev => (prev.some(t => t.id === saved.id) ? prev : [saved, ...prev]));
    setNewDescription("");
    setStance("");
    setSelectedPresetTitle("<< Select >>");
    setCreateOpen(false);
  };

  return (
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
              "<< Select >>",
              "Agriculture and Agri-Food",
              "Elections",
              "Employment and Social Development",
              "Environment and Climate Change",
              "Entertainment",
              "Finance",
              "Fisheries and Oceans",
              "Global Affairs",
              "Health",
              "Heritage",
              "Immigration, Refugees and Citizenship",
              "Indigenous Services",
              "Infrastructure",
              "Innovation, Science and Economic Development",
              "Justice",
              "Local Affairs",
              "National Defence",
              "Natural Resources",
              "Public Safety",
              "Public Services and Procurement",
              "Transport",
              "Veterans Affairs",
            ].map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <textarea
            placeholder="Description (required)"
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
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
          <button type="submit" disabled={selectedPresetTitle === "<< Select >>"}>
            Create Topic
          </button>
        </form>
      </div>
    </section>
  );
}
