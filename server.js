
require("dotenv").config();

const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("./db");
const sessionMiddleware = require("./session");

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Render's HTTPS reverse proxy
if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

app.use(express.json({ limit: "100kb" }));
app.use(sessionMiddleware);

// Check whether a user is logged in
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            error: "Please sign in first"
        });
    }

    next();
}

// Register a new account
app.post("/api/register", async (req, res) => {
    const { email, password } = req.body;

    if (
        typeof email !== "string" ||
        typeof password !== "string"
    ) {
        return res.status(400).json({
            error: "Email and password are required"
        });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (
        normalizedEmail.length > 255 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
        return res.status(400).json({
            error: "Please enter a valid email address"
        });
    }

    if (password.length < 12 || password.length > 72) {
        return res.status(400).json({
            error: "Password must be 12 to 72 characters long"
        });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 12);

        const [result] = await pool.execute(
            `INSERT INTO users (email, password_hash)
             VALUES (?, ?)`,
            [normalizedEmail, passwordHash]
        );

        // Create a fresh session after registration
        req.session.regenerate((error) => {
            if (error) {
                console.error(error);
                return res.status(500).json({
                    error: "Account created, but sign-in failed. Please sign in."
                });
            }

            req.session.userId = result.insertId;
            req.session.email = normalizedEmail;

            req.session.save((saveError) => {
                if (saveError) {
                    console.error(saveError);
                    return res.status(500).json({
                        error: "Account created, but sign-in failed. Please sign in."
                    });
                }

                res.status(201).json({
                    message: "Account created successfully",
                    user: {
                        id: result.insertId,
                        email: normalizedEmail
                    }
                });
            });
        });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                error: "An account with this email already exists"
            });
        }

        console.error(error);
        res.status(500).json({
            error: "Could not create account"
        });
    }
});

// Sign in
app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;

    if (
        typeof email !== "string" ||
        typeof password !== "string"
    ) {
        return res.status(400).json({
            error: "Email and password are required"
        });
    }

    try {
        const [users] = await pool.execute(
            `SELECT id, email, password_hash
             FROM users
             WHERE email = ?`,
            [email.trim().toLowerCase()]
        );

        if (
            users.length === 0 ||
            !(await bcrypt.compare(password, users[0].password_hash))
        ) {
            return res.status(401).json({
                error: "Invalid email or password"
            });
        }

        const user = users[0];

        // Prevent session fixation
        req.session.regenerate((error) => {
            if (error) {
                console.error(error);
                return res.status(500).json({
                    error: "Could not sign in"
                });
            }

            req.session.userId = user.id;
            req.session.email = user.email;

            req.session.save((saveError) => {
                if (saveError) {
                    console.error(saveError);
                    return res.status(500).json({
                        error: "Could not sign in"
                    });
                }

                res.json({
                    message: "Signed in successfully",
                    user: {
                        id: user.id,
                        email: user.email
                    }
                });
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Could not sign in"
        });
    }
});

// Get the current user's session
app.get("/api/me", requireAuth, (req, res) => {
    res.json({
        user: {
            id: req.session.userId,
            email: req.session.email
        }
    });
});

// Sign out
app.post("/api/logout", requireAuth, (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error(error);
            return res.status(500).json({
                error: "Could not sign out"
            });
        }

        res.clearCookie("notenest.sid", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/"
        });

        res.json({
            message: "Signed out successfully"
        });
    });
});

// Get only the logged-in user's notes
app.get("/api/notes", requireAuth, async (req, res) => {
    try {
        const [notes] = await pool.execute(
            `SELECT id, title, content, created_at
             FROM notes
             WHERE user_id = ?
             ORDER BY id DESC`,
            [req.session.userId]
        );

        res.json(notes);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Could not retrieve notes"
        });
    }
});

// Create a note for the logged-in user
app.post("/api/notes", requireAuth, async (req, res) => {
    const { title, content } = req.body;

    if (
        typeof title !== "string" ||
        typeof content !== "string" ||
        !title.trim() ||
        !content.trim() ||
        title.trim().length > 255 ||
        content.length > 100000
    ) {
        return res.status(400).json({
            error: "Enter a title (max 255 characters) and content (max 100,000 characters)"
        });
    }

    try {
        const [result] = await pool.execute(
            `INSERT INTO notes (user_id, title, content)
             VALUES (?, ?, ?)`,
            [
                req.session.userId,
                title.trim(),
                content.trim()
            ]
        );

        const [rows] = await pool.execute(
            `SELECT id, title, content, created_at
             FROM notes
             WHERE id = ? AND user_id = ?`,
            [result.insertId, req.session.userId]
        );

        res.status(201).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Could not save note"
        });
    }
});

// Update an existing note belonging to the logged-in user
app.put("/api/notes/:id", requireAuth, async (req, res) => {
    const noteId = Number(req.params.id);
    const { title, content } = req.body;

    if (!Number.isSafeInteger(noteId) || noteId <= 0) {
        return res.status(400).json({
            error: "Invalid note ID"
        });
    }

    if (
        typeof title !== "string" ||
        typeof content !== "string" ||
        !title.trim() ||
        !content.trim() ||
        title.trim().length > 255 ||
        content.length > 100000
    ) {
        return res.status(400).json({
            error: "Enter a title (max 255 characters) and content (max 100,000 characters)"
        });
    }

    try {
        const [result] = await pool.execute(
            `UPDATE notes
             SET title = ?, content = ?
             WHERE id = ? AND user_id = ?`,
            [
                title.trim(),
                content.trim(),
                noteId,
                req.session.userId
            ]
        );

        if (result.affectedRows === 0) {
    const [existingNotes] = await pool.execute(
        `SELECT id
         FROM notes
         WHERE id = ? AND user_id = ?`,
        [noteId, req.session.userId]
        );

        if (existingNotes.length === 0) {
        return res.status(404).json({
            error: "Note not found"
        });
        }
    }

        res.json({
        message: "Note updated successfully"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Could not update note"
        });
    }
});

// Delete an existing note belonging to the logged-in user
app.delete("/api/notes/:id", requireAuth, async (req, res) => {
    const noteId = Number(req.params.id);

    if (!Number.isSafeInteger(noteId) || noteId <= 0) {
        return res.status(400).json({
            error: "Invalid note ID"
        });
    }

    try {
        const [result] = await pool.execute(
            `DELETE FROM notes
             WHERE id = ? AND user_id = ?`,
            [noteId, req.session.userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: "Note not found"
            });
        }

        res.json({
            message: "Note deleted successfully"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Could not delete note"
        });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`NoteNest is running at http://localhost:${PORT}`);
});
