// src/App.js
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import MainApp from "./MainApp"; // Your current App component will become MainApp
import AdminAds from "./AdminAds";

export default function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<MainApp />} />
                <Route path="/admin/ads" element={<AdminAds />} />
            </Routes>
        </Router>
    );
}