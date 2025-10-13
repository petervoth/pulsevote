import React from "react";

export default function Filters({
  searchText,
  setSearchText,
  filterTitle,
  setFilterTitle,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  sortOption,
  setSortOption,
}) {
  return (
    <section className="filter-section card">
      <form className="compact-form">
        <input
          type="text"
          placeholder="Search description..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{ marginBottom: "0.5rem", width: "100%", height: "2.5rem", padding: "0.5rem" }}
        />
        <input
          type="text"
          placeholder="Filter by title"
          value={filterTitle}
          onChange={e => setFilterTitle(e.target.value)}
          style={{ marginBottom: "0.5rem", width: "100%", height: "2.5rem", padding: "0.5rem" }}
        />
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
    </section>
  );
}
