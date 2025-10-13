import React from "react";
import TopicSpotlight from "./TopicSpotlight";
import UserSpotlight from "./UserSpotlight";
import CreateTopicForm from "./CreateTopicForm";
import Filters from "./Filters";
import TopicList from "./TopicList";
import { signUp, signIn, signOut } from "../utils/auth";

export default function Sidebar({
  user,
  setUser,
  profile,
  setProfile,
  signUpEmail,
  setSignUpEmail,
  signUpPassword,
  setSignUpPassword,
  loginEmail,
  setLoginEmail,
  loginPassword,
  setLoginPassword,
  topics,
  heatPoints,
  selectedTopic,
  setSelectedTopic,
  userSpotlightOpen,
  setUserSpotlightOpen,
  selectedUserPoint,
  setSelectedUserPoint,
  feedRef,
  hasMore,
  setPage,
  setTopics,
  setHasMore,
  setHeatPoints,
  filterOpen,
  setFilterOpen,
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
  const handleSignUp = async e => {
    e.preventDefault();
    try {
      const newUser = await signUp(signUpEmail, signUpPassword);
      setUser(newUser);
      setSignUpEmail("");
      setSignUpPassword("");
    } catch (err) {
      alert("Sign-up failed.");
      console.error(err);
    }
  };

  const handleLogin = async e => {
    e.preventDefault();
    try {
      const loggedInUser = await signIn(loginEmail, loginPassword);
      setUser(loggedInUser);
      setLoginEmail("");
      setLoginPassword("");
    } catch (err) {
      alert("Login failed.");
      console.error(err);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      setUser(null);
      setProfile(null);
    } catch (err) {
      alert("Logout failed.");
      console.error(err);
    }
  };

  return (
    <aside className="right-column" style={{ width: 300, display: "flex", flexDirection: "column" }}>
      {userSpotlightOpen ? (
        <UserSpotlight
          selectedUserPoint={selectedUserPoint}
          setUserSpotlightOpen={setUserSpotlightOpen}
          setSelectedUserPoint={setSelectedUserPoint}
        />
      ) : selectedTopic ? (
        <TopicSpotlight
          user={user}
          profile={profile}
          selectedTopic={selectedTopic}
          heatPoints={heatPoints}
          setHeatPoints={setHeatPoints}
          setSelectedTopic={setSelectedTopic}
        />
      ) : (
        <>
          <section className="auth-section card">
            {!user ? (
              <>
                <form onSubmit={handleSignUp} className="compact-form">
                  <h4>Sign Up</h4>
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
                  <button type="submit">Create Account</button>
                </form>
                <form onSubmit={handleLogin} className="compact-form">
                  <h4>Log In</h4>
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
                  <button type="submit">Log In</button>
                </form>
              </>
            ) : (
              <div style={{ padding: "1rem" }}>
                <p>Signed in as <strong>{user.email}</strong></p>
                <button onClick={handleLogout}>Log Out</button>
              </div>
            )}
          </section>

          <CreateTopicForm
            user={user}
            profile={profile}
            setTopics={setTopics}
            setHeatPoints={setHeatPoints}
          />

          <section className="filter-toggle card">
            <button onClick={() => setFilterOpen(o => !o)}>
              {filterOpen ? "Hide Filters" : "Show Filters"}
            </button>
          </section>

          {filterOpen && (
            <Filters
              searchText={searchText}
              setSearchText={setSearchText}
              filterTitle={filterTitle}
              setFilterTitle={setFilterTitle}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              sortOption={sortOption}
              setSortOption={setSortOption}
            />
          )}

          <TopicList
            topics={topics}
            heatPoints={heatPoints}
            setSelectedTopic={setSelectedTopic}
            feedRef={feedRef}
            hasMore={hasMore}
            setPage={setPage}
            setTopics={setTopics}
            setHasMore={setHasMore}
          />
        </>
      )}
    </aside>
  );
}
