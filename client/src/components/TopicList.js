import React, { useEffect } from "react";

export default function TopicList({
  topics,
  heatPoints,
  setSelectedTopic,
  feedRef,
  hasMore,
  setPage,
  setTopics,
  setHasMore,
}) {
  const handleSelectTopic = topic => {
    const topicVotes = heatPoints.filter(p => p.topic_id === topic.id);
    setSelectedTopic({ ...topic, renderPoints: topicVotes });
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore) {
          setPage(prev => {
            const nextPage = prev + 1;
            fetch(`${process.env.REACT_APP_API_BASE || "http://localhost:5000"}/topics?limit=20&offset=${nextPage * 20}`)
              .then(res => res.json())
              .then(rows => {
                setTopics(prev => [...prev, ...rows]);
                setHasMore(rows.length === 20);
              });
            return nextPage;
          });
        }
      },
      { threshold: 1 }
    );

    const sentinel = document.getElementById("topic-list-sentinel");
    if (sentinel) observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMore, setPage, setTopics, setHasMore]);

  return (
    <section className="feed-section card" ref={feedRef}>
      <ul>
        {topics.map(t => (
          <li
            key={t.id}
            className="feed-item feed-item--clickable"
            onClick={() => handleSelectTopic(t)}
            role="button"
            tabIndex={0}
          >
            <div className="feed-title">{t.title}</div>
            {t.description && <div className="feed-desc">{t.description}</div>}
            {t.created_at && (
              <div className="feed-date">
                {new Date(t.created_at).toLocaleString()}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div id="topic-list-sentinel" style={{ height: 1 }} />
      {!hasMore && (
        <p style={{ textAlign: "center", color: "#666" }}>No more topics</p>
      )}
    </section>
  );
}
