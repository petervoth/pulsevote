// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const pool = require("./db"); // your pg Pool instance from db.js
const { createClient } = require('@supabase/supabase-js');
const {
    sendAdminNotification,
    sendSubmissionConfirmation,
    sendApprovalNotification,
    sendRejectionNotification,
} = require('./email-service');

const app = express();

// Initialize Supabase client for Storage
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// CORS & JSON middleware
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
app.use(
    cors({
        origin: FRONTEND_URL,
        credentials: true,
    })
);
app.use(express.json());

// Configure multer for image uploads
const storage = multer.memoryStorage(); // Store in memory for processing
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept images only
        if (!file.mimetype.match(/^image\/(jpeg|jpg|png|webp)$/)) {
            return cb(new Error('Only image files (JPEG, PNG, WebP) are allowed'), false);
        }
        cb(null, true);
    },
});

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
// Twinkle points route
// ---------------------------
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

// ===========================
// AD SUBMISSION ENDPOINTS
// ===========================

/**
 * Upload image to Supabase Storage
 */
async function uploadImageToStorage(fileBuffer, fileName, mimeType) {
    try {
        console.log(`📤 Uploading image to Supabase: ${fileName}`);

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from('ad-images')
            .upload(`ads/${fileName}`, fileBuffer, {
                contentType: mimeType,
                upsert: false
            });

        if (error) {
            console.error('Supabase upload error:', error);
            throw error;
        }

        console.log('✅ Image uploaded successfully:', data);

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('ad-images')
            .getPublicUrl(`ads/${fileName}`);

        console.log('🔗 Public URL:', urlData.publicUrl);

        return urlData.publicUrl;
    } catch (error) {
        console.error('Error uploading image:', error);
        throw new Error('Failed to upload image');
    }
}

/**
 * POST /api/ad-submissions
 * Submit a new ad for review
 */
app.post("/api/ad-submissions", upload.single('image'), async (req, res) => {
    try {
        console.log('📥 Received ad submission request');
        console.log('Body:', req.body);
        console.log('File:', req.file ? `${req.file.originalname} (${req.file.size} bytes)` : 'No file');

        const { companyName, adText, linkUrl, email, duration, amount, startDate } = req.body;
        const imageFile = req.file;

        // Validate required fields
        if (!companyName || !adText || !linkUrl || !email || !duration || !amount) {
            return res.status(400).json({
                error: "Missing required fields",
                required: ["companyName", "adText", "linkUrl", "email", "duration", "amount", "image"]
            });
        }

        if (!imageFile) {
            return res.status(400).json({ error: "Image file is required" });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: "Invalid email format" });
        }

        // Validate URL format
        try {
            new URL(linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`);
        } catch {
            return res.status(400).json({ error: "Invalid URL format" });
        }

        // Validate duration
        const validDurations = [7, 14, 30];
        if (!validDurations.includes(parseInt(duration))) {
            return res.status(400).json({ error: "Invalid duration. Must be 7, 14, or 30 days" });
        }

        // Validate start date
        if (!startDate) {
            return res.status(400).json({ error: "Start date is required" });
        }

        const requestedStartDate = new Date(startDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (isNaN(requestedStartDate.getTime())) {
            return res.status(400).json({ error: "Invalid start date format" });
        }

        if (requestedStartDate < today) {
            return res.status(400).json({ error: "Start date cannot be in the past" });
        }

        // Upload image to Supabase Storage
        const fileName = `${Date.now()}-${imageFile.originalname}`;
        let imageUrl;

        try {
            imageUrl = await uploadImageToStorage(
                imageFile.buffer,
                fileName,
                imageFile.mimetype
            );
            console.log('✅ Image uploaded successfully:', imageUrl);
        } catch (uploadError) {
            console.error('❌ Image upload error:', uploadError);
            return res.status(500).json({ error: "Failed to upload image" });
        }

        // Convert amount to cents if needed
        const amount_cents = Math.round(parseFloat(amount) * 100);

        // Insert ad submission into database
        const result = await pool.query(
            `INSERT INTO ad_submissions (
        company_name,
        ad_text,
        link_url,
        buyer_email,
        image_url,
        duration_days,
        amount_cents,
        status,
        start_date,
        submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_review', $8, NOW())
      RETURNING *`,
            [
                companyName,
                adText,
                linkUrl,
                email,
                imageUrl,
                parseInt(duration),
                amount_cents,
                requestedStartDate
            ]
        );

        const newAdSubmission = result.rows[0];
        console.log('✅ Ad submission saved to database:', newAdSubmission.id);

        // Send email notifications (async, don't wait)
        Promise.all([
            sendAdminNotification(newAdSubmission),
            sendSubmissionConfirmation(newAdSubmission)
        ]).catch(err => {
            console.error('Failed to send notification emails:', err);
        });

        res.status(201).json({
            id: newAdSubmission.id,
            message: "Ad submission received successfully",
            status: newAdSubmission.status
        });
    } catch (err) {
        console.error("❌ Error creating ad submission:", err);
        res.status(500).json({ error: "Server error", details: err.message });
    }
});

/**
 * GET /api/ad-submissions
 * Get all ad submissions (admin only)
 */
app.get("/api/ad-submissions", async (req, res) => {
    try {
        const status = req.query.status;

        let query = `
      SELECT
        id,
        company_name,
        ad_text,
        link_url,
        buyer_email,
        image_url,
        duration_days,
        amount_cents,
        status,
        payment_intent_id,
        submitted_at,
        reviewed_at,
        reviewed_by,
        notes,
        start_date,
        end_date
      FROM ad_submissions
    `;

        const params = [];

        if (status) {
            query += ` WHERE status = $1`;
            params.push(status);
        }

        query += ` ORDER BY submitted_at DESC`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching ad submissions:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/**
 * GET /api/ad-submissions/:id
 * Get a specific ad submission
 */
app.get("/api/ad-submissions/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT
        id,
        company_name,
        ad_text,
        link_url,
        buyer_email,
        image_url,
        duration_days,
        amount_cents,
        status,
        payment_intent_id,
        submitted_at,
        reviewed_at,
        reviewed_by,
        notes,
        start_date,
        end_date
      FROM ad_submissions
      WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Ad submission not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error fetching ad submission:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/**
 * PUT /api/ad-submissions/:id/approve
 * Approve an ad submission and make it live
 */
app.put("/api/ad-submissions/:id/approve", async (req, res) => {
    try {
        const { id } = req.params;
        const { reviewedBy, notes } = req.body;

        const adCheck = await pool.query(
            `SELECT * FROM ad_submissions WHERE id = $1`,
            [id]
        );

        if (adCheck.rows.length === 0) {
            return res.status(404).json({ error: "Ad submission not found" });
        }

        const ad = adCheck.rows[0];

        if (ad.status !== 'pending_review') {
            return res.status(400).json({
                error: "Ad is not in pending_review status",
                currentStatus: ad.status
            });
        }

        // TODO: Capture payment via Stripe
        console.log('💰 Payment would be captured here for:', ad.payment_intent_id);

        // Use the requested start date from the submission, or default to now
        const startDate = ad.start_date ? new Date(ad.start_date) : new Date();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + ad.duration_days);

        // Update ad submission to approved/live status
        const result = await pool.query(
            `UPDATE ad_submissions
       SET
         status = 'live',
         reviewed_at = NOW(),
         reviewed_by = $1,
         notes = $2,
         start_date = $3,
         end_date = $4
       WHERE id = $5
       RETURNING *`,
            [reviewedBy || 'admin', notes || null, startDate, endDate, id]
        );

        const updatedAd = result.rows[0];
        console.log('✅ Ad approved and is now live:', updatedAd.id);

        // Send approval email to buyer
        sendApprovalNotification(updatedAd).catch(err => {
            console.error('Failed to send approval email:', err);
        });

        res.json({
            message: "Ad approved and is now live",
            ad: updatedAd
        });
    } catch (err) {
        console.error("Error approving ad submission:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/**
 * PUT /api/ad-submissions/:id/reject
 * Reject an ad submission and cancel payment
 */
app.put("/api/ad-submissions/:id/reject", async (req, res) => {
    try {
        const { id } = req.params;
        const { reviewedBy, notes } = req.body;

        const adCheck = await pool.query(
            `SELECT * FROM ad_submissions WHERE id = $1`,
            [id]
        );

        if (adCheck.rows.length === 0) {
            return res.status(404).json({ error: "Ad submission not found" });
        }

        const ad = adCheck.rows[0];

        if (ad.status !== 'pending_review') {
            return res.status(400).json({
                error: "Ad is not in pending_review status",
                currentStatus: ad.status
            });
        }

        // TODO: Cancel payment intent via Stripe
        console.log('❌ Payment would be cancelled here for:', ad.payment_intent_id);

        // Update ad submission to rejected status
        const result = await pool.query(
            `UPDATE ad_submissions
       SET
         status = 'rejected',
         reviewed_at = NOW(),
         reviewed_by = $1,
         notes = $2
       WHERE id = $3
       RETURNING *`,
            [reviewedBy || 'admin', notes || 'Ad did not meet quality standards', id]
        );

        const updatedAd = result.rows[0];
        console.log('❌ Ad rejected:', updatedAd.id);

        // Send rejection email to buyer
        sendRejectionNotification(updatedAd, notes).catch(err => {
            console.error('Failed to send rejection email:', err);
        });

        res.json({
            message: "Ad rejected",
            ad: updatedAd
        });
    } catch (err) {
        console.error("Error rejecting ad submission:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/**
 * GET /api/ads/active
 * Get currently active (live) ads for display on the site
 */
app.get("/api/ads/active", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
        id,
        company_name,
        ad_text,
        link_url,
        image_url
      FROM ad_submissions
      WHERE status = 'live'
        AND start_date <= NOW()
        AND end_date >= NOW()
      ORDER BY RANDOM()
      LIMIT 10`
        );

        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching active ads:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// ---------------------------
// Health check endpoint
// ---------------------------
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

// Serve React build as static files
const clientBuildPath = path.join(__dirname, 'client', 'build');
app.use(express.static(clientBuildPath));

// Fallback: serve index.html for all unmatched routes (React Router support)
app.use((req, res, next) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/') || req.path.startsWith('/topics') ||
        req.path.startsWith('/points') || req.path.startsWith('/twinkle_points') ||
        req.path.startsWith('/profiles') || req.path.startsWith('/health')) {
        return next();
    }
    res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Error handling middleware for multer errors
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File size too large. Maximum 5MB allowed.' });
        }
        return res.status(400).json({ error: err.message });
    } else if (err) {
        console.error('Server error:', err);
        return res.status(500).json({ error: err.message });
    }
    next();
});

// ---------------------------
// Start server
// ---------------------------
const PORT = parseInt(process.env.PORT, 10) || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
    console.log(`📊 Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
    console.log(`🗄️ Supabase Storage: ${process.env.SUPABASE_URL ? 'Configured' : 'Not configured'}`);
});