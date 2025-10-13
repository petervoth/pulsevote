import React, { useState, useMemo } from "react";

export default function TopicFeed({ topics, onSelect }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [stanceFilter, setStanceFilter] = useState("");
  const [sortKey, setSortKey] = useState("date"); // "date" or "votes"

  // 1. Filter by search term & stance
  const filtered = useMemo(() => {
    return topics
      .filter(t => 
        t.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (stanceFilter === "" || t.stanceSummary?.[stanceFilter] > 0)
      );
  }, [topics, searchTerm, stanceFilter]);

  // 2. Sort by date or vote‐count
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === "votes") {
        return (b.voteCount || 0) - (a.voteCount || 0);
      }
      // default: newest first
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [filtered, sortKey]);

  return (
    <div className="feed-section card">
      <div className="feed-controls">
        <input
          type="search"
          placeholder="Search topics…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        <select
          value={stanceFilter}
          onChange={e => setStanceFilter(e.target.value)}
        >
          <option value="">All stances</option>
          {["-No","No","Neutral","Yes","Yes+"].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value)}
        >
          <option value="date">Newest</option>
          <option value="votes">Most Votes</option>
        </select>
      </div>

      <ul className="feed-list">
        {sorted.map(t => (
          <li
            key={t.id}
            className="feed-item feed-item--clickable"
            onClick={() => onSelect(t)}
          >
            <div className="feed-title">{t.title}</div>
            <div className="feed-meta">
              <span>{t.voteCount || 0} votes</span>
              <span>{new Date(t.created_at).toLocaleDateString()}</span>
            </div>
          </li>
        ))}
      </ul>
      {!sorted.length && <p className="empty-state">No topics match.</p>}
    </div>
  );
}
