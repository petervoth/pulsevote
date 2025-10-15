// server.js

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const pool = require("./db"); // your pg Pool instance from db.js

const app = express();

// CORS & JSON middleware
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
app.use(
    cors({
        origin: FRONTEND_URL,
        credentials: true,
    })
);
app.use(express.json());

// HTTP server + Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: FRONTEND_URL, credentials: true },
});

// ---------------------------
// Socket.IO connections & rooms
// ---------------------------
io.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id);

    socket.on("subscribe_topic", ({ topic_id }) => {
        if (topic_id) {
            console.log(`✅ Socket ${socket.id} joining topic:${topic_id}`);
            socket.join(`topic:${topic_id}`);
        }
    });

    socket.on("unsubscribe_topic", ({ topic_id }) => {
        if (topic_id) {
            console.log(`⛔ Socket ${socket.id} leaving topic:${topic_id}`);
            socket.leave(`topic:${topic_id}`);
        }
    });

    socket.on("disconnect", () =>
        console.log("❌ Client disconnected:", socket.id)
    );
});

// ---------------------------
// Topics routes
// ---------------------------

// Get all topics with vote counts
app.get("/topics", async (req, res) => {
    try {
        // Get limit and offset from query params for pagination
        const limit = parseInt(req.query.limit) || 1000;
        const offset = parseInt(req.query.offset) || 0;

        const result = await pool.query(
            `SELECT 
                t.id, 
                t.title, 
                t.description, 
                t.created_by, 
                t.stance, 
                t.created_at,
                COUNT(DISTINCT p.user_id) as vote_count
            FROM topics t
            LEFT JOIN points p ON t.id::text = p.topic_id::text
            GROUP BY t.id, t.title, t.description, t.created_by, t.stance, t.created_at
            ORDER BY t.created_at DESC
            LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        // Ensure result.rows exists and is an array
        if (!result || !result.rows || !Array.isArray(result.rows)) {
            console.error("Unexpected query result:", result);
            return res.json([]);
        }

        // Convert vote_count from string to number
        const topics = result.rows.map(row => ({
            ...row,
            vote_count: parseInt(row.vote_count) || 0
        }));

        res.json(topics);
    } catch (err) {
        console.error("Error fetching topics:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Create a new topic (with rate limiting: 1 per day per user)
app.post("/topics", async (req, res) => {
    try {
        const { title, description, created_by, stance } = req.body;
        if (!title || !created_by) {
            return res
                .status(400)
                .json({ error: "title and created_by required" });
        }

        // Check if user has created a topic in the last 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentTopicCheck = await pool.query(
            `SELECT id, created_at 
             FROM topics 
             WHERE created_by = $1 
             AND created_at > $2 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [created_by, oneDayAgo]
        );

        if (recentTopicCheck.rows.length > 0) {
            const lastTopicTime = new Date(recentTopicCheck.rows[0].created_at);
            const nextAllowedTime = new Date(lastTopicTime.getTime() + 24 * 60 * 60 * 1000);
            const hoursLeft = Math.ceil((nextAllowedTime - Date.now()) / (1000 * 60 * 60));

            return res.status(429).json({
                error: "Rate limit exceeded",
                message: `You can only create one topic per day. Try again in ${hoursLeft} hour(s).`,
                nextAllowedTime: nextAllowedTime.toISOString()
            });
        }

        // If no recent topic, proceed with creation
        const result = await pool.query(
            `INSERT INTO topics
             (title, description, created_by, stance, created_at)
             VALUES
             ($1, $2, $3, $4, NOW())
             RETURNING *`,
            [title, description || null, created_by, stance || null]
        );

        const newTopic = result.rows[0];
        io.emit("new_topic", newTopic);
        res.status(201).json(newTopic);
    } catch (err) {
        console.error("Error creating topic:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// ---------------------------
// Points routes
// ---------------------------

// Get latest point per user for a given topic
// Query string: ?topic_id=<topicId>
app.get("/points", async (req, res) => {
    const topicId = req.query.topic_id;
    if (!topicId) {
        return res
            .status(400)
            .json({ error: "topic_id query param is required" });
    }

    try {
        const result = await pool.query(
            `SELECT DISTINCT ON (user_id)
         id, user_id, topic_id, lat, lng, intensity, stance, created_at
       FROM points
       WHERE topic_id = $1
         AND stance IS NOT NULL
         AND stance <> ''
       ORDER BY user_id, created_at DESC`,
            [topicId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching points by topic:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Get nearby latest point per user for a topic
// Query string: ?lat=<lat>&lng=<lng>&radius=<meters>&topic_id=<topicId>
app.get("/points/nearby", async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);
        const radius = parseInt(req.query.radius || "1000", 10);
        const topicId = req.query.topic_id;

        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            return res
                .status(400)
                .json({ error: "lat and lng query params must be numbers" });
        }
        if (!topicId) {
            return res.status(400).json({ error: "topic_id is required" });
        }

        const sql = `
      WITH latest AS (
        SELECT DISTINCT ON (user_id) *
        FROM points
        WHERE topic_id = $4
        ORDER BY user_id, created_at DESC
      )
      SELECT
        id,
        user_id,
        topic_id,
        lat,
        lng,
        intensity,
        stance,
        created_at,
        ST_Distance(
          location,
          ST_SetSRID(
            ST_MakePoint($2::double precision, $1::double precision),
            4326
          )::geography
        ) AS distance_m
      FROM latest
      WHERE ST_DWithin(
        location,
        ST_SetSRID(
          ST_MakePoint($2::double precision, $1::double precision),
          4326
        )::geography,
        $3
      )
      ORDER BY distance_m ASC, created_at DESC
      LIMIT 500;
    `;

        const params = [lng, lat, radius, topicId];
        const result = await pool.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching nearby points:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Insert a new point (always INSERT, keep history)
// Expects JSON body: { lat, lng, intensity, topic_id, user_id, stance }
app.post("/points", async (req, res) => {
    try {
        const { lat, lng, intensity, topic_id, user_id, stance } = req.body;
        if (
            typeof lat !== "number" ||
            typeof lng !== "number" ||
            !topic_id ||
            !user_id
        ) {
            return res.status(400).json({
                error: "lat, lng, topic_id, and user_id are required",
            });
        }

        const intensityNum = Number(intensity) || 0;
        const stanceValue =
            stance !== undefined &&
                stance !== null &&
                String(stance).trim() !== ""
                ? String(stance).trim()
                : null;

        const insertSql = `
      INSERT INTO points
        (lat, lng, intensity, topic_id, user_id, stance, created_at, location)
      VALUES
        ($1, $2, $3, $4, $5, $6, NOW(),
         ST_SetSRID(
           ST_MakePoint($2::double precision, $1::double precision),
           4326
         )::geography
        )
      RETURNING *;
    `;

        const values = [lat, lng, intensityNum, topic_id, user_id, stanceValue];
        const result = await pool.query(insertSql, values);

        const newPoint = result.rows[0];
        io.to(`topic:${newPoint.topic_id}`).emit("new_point", newPoint);

        res.status(201).json(newPoint);
    } catch (err) {
        console.error("Error inserting point:", err);
        res.status(500).json({ error: "Server error" });
    }
});


// Topic share Route
app.get("/topics/:id", async (req, res) => {
    try {
        const topicId = req.params.id;
        const result = await pool.query(
            `SELECT 
                t.id, 
                t.title, 
                t.description, 
                t.created_by, 
                t.stance, 
                t.created_at,
                COUNT(DISTINCT p.user_id) as vote_count
            FROM topics t
            LEFT JOIN points p ON t.id::text = p.topic_id::text
            WHERE t.id = $1
            GROUP BY t.id, t.title, t.description, t.created_by, t.stance, t.created_at`,
            [topicId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Topic not found" });
        }

        const topic = {
            ...result.rows[0],
            vote_count: parseInt(result.rows[0].vote_count) || 0
        };

        res.json(topic);
    } catch (err) {
        console.error("Error fetching topic by ID:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// ---------------------------
// NEW! Twinkle points route
// ---------------------------

// NEW! GET /twinkle_points (extract lat/lng from geography)
app.get("/twinkle_points", async (_req, res) => {
    try {
        const sql = `
      SELECT
        id,
        intensity,
        stance,
        ST_Y(location::geometry) AS lat,
        ST_X(location::geometry) AS lng
      FROM twinkle_points
      ORDER BY created_at DESC
    `;
        const { rows } = await pool.query(sql);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching twinkle_points:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Reset homebase (with rate limiting: once per 180 days)
app.put("/profiles/:userId/reset-homebase", async (req, res) => {
    try {
        const { userId } = req.params;
        const { lat, lng } = req.body;

        if (typeof lat !== "number" || typeof lng !== "number") {
            return res.status(400).json({ error: "Valid lat and lng required" });
        }

        // Check last reset time
        const profileCheck = await pool.query(
            `SELECT homebase_last_reset FROM profiles WHERE id = $1`,
            [userId]
        );

        if (profileCheck.rows.length === 0) {
            return res.status(404).json({ error: "Profile not found" });
        }

        const lastReset = profileCheck.rows[0].homebase_last_reset;

        if (lastReset) {
            const daysSinceReset = (Date.now() - new Date(lastReset).getTime()) / (1000 * 60 * 60 * 24);
            const daysLeft = Math.ceil(180 - daysSinceReset);

            if (daysSinceReset < 180) {
                return res.status(429).json({
                    error: "Rate limit exceeded",
                    message: `You can only reset your homebase once every 180 days. Try again in ${daysLeft} day(s).`,
                    daysLeft: daysLeft
                });
            }
        }

        // Update homebase
        const result = await pool.query(
            `UPDATE profiles 
             SET home_lat = $1, 
                 home_lng = $2, 
                 homebase_set = true,
                 homebase_last_reset = NOW()
             WHERE id = $3
             RETURNING *`,
            [lat, lng, userId]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error resetting homebase:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// ---------------------------
// Health check endpoint
// ---------------------------
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

// Serve React build as static files (add this near the end)
const path = require('path');
const clientBuildPath = path.join(__dirname, 'client', 'build');
app.use(express.static(clientBuildPath));

// Fallback: serve index.html for all unmatched routes (React Router support)
app.use((req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// ---------------------------
// Start server
// ---------------------------
const PORT = parseInt(process.env.PORT, 10) || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});