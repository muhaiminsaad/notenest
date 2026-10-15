require("dotenv").config();

const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const fs = require("fs");
const path = require("path");

const ca = fs.readFileSync(
    path.join(__dirname, "ca.pem")
);

const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,

    ssl: {
        ca,
        rejectUnauthorized: true
    },

    createDatabaseTable: true
});

const sessionMiddleware = session({
    name: "notenest.sid",
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24
    }
});

module.exports = sessionMiddleware;