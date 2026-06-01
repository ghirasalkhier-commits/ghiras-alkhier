const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xss = require('xss');

require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev'; 
const { OAuth2Client } = require('google-auth-library');
const GOOGLE_CLIENT_ID = '243818682762-0gidrn9ft8vc5aff5fm3eognstfr4bdb.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error("Only image files are allowed!"));
        }
    }
});


const app = express();

// Global XSS Sanitizer for all JSON responses
const originalJson = express.response.json;
express.response.json = function(data) {
    function sanitizeData(obj) {
        if (typeof obj === 'string') return xss(obj);
        if (Array.isArray(obj)) return obj.map(sanitizeData);
        if (typeof obj === 'object' && obj !== null) {
            const sanitizedObj = {};
            for (let key in obj) {
                sanitizedObj[key] = sanitizeData(obj[key]);
            }
            return sanitizedObj;
        }
        return obj;
    }
    return originalJson.call(this, sanitizeData(data));
};

const PORT = 3000;

// Middleware
// Security Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disabled temporarily for development (to allow external fonts/images)
    crossOriginOpenerPolicy: false, // Required for Google Sign-In popup to communicate with the page
    referrerPolicy: false, // Required for Google Sign-In to verify the Origin
}));

// Rate Limiting
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Limit each IP to 200 requests per `window`
    message: { error: "Too many requests from this IP, please try again after 15 minutes" },
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 auth requests per `window`
    message: { error: "Too many login attempts from this IP, please try again after 15 minutes" },
});

app.use('/api/', generalLimiter);
app.use('/api/auth/', authLimiter); // Apply stricter limits to auth routes

app.use(cors());
app.use(express.json());

// Serve static files (HTML, CSS, JS) from the public directory
// Disable caching for HTML files to prevent stale views during development
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize SQLite Database
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        // Create Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password TEXT,
            firstName TEXT,
            lastName TEXT,
            phone TEXT,
            gender TEXT,
            provider TEXT DEFAULT 'local',
            role TEXT DEFAULT 'user',
            country TEXT,
            profilePicture TEXT
        )`, (err) => {
            db.run(`ALTER TABLE users ADD COLUMN country TEXT`, (err) => {});
            db.run(`ALTER TABLE users ADD COLUMN profilePicture TEXT`, (err) => {});
            if (!err) {
                // Seed Admin User
                db.get(`SELECT * FROM users WHERE email = 'ghirasalkhier@gmail.com'`, (err, row) => {
                    if (!row) {
                        db.run(`INSERT INTO users (email, password, firstName, lastName, role, provider) 
                                VALUES ('ghirasalkhier@gmail.com', 'ahlalkhair123', 'Admin', 'Ghiras', 'admin', 'local')`);
                        console.log('Admin user seeded.');
                    }
                });
            }
        });

        // Create Carts Table
        db.run(`CREATE TABLE IF NOT EXISTS carts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT,
            product_id TEXT,
            product_name TEXT,
            price REAL,
            quantity INTEGER,
            image TEXT
        )`);

        // Keep Products Table and add watering column
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            description TEXT,
            price REAL,
            image TEXT,
            category TEXT,
            stock INTEGER DEFAULT 1,
            watering TEXT
        )`, () => {
            // Safely add column if table already exists from older version
            db.run(`ALTER TABLE products ADD COLUMN watering TEXT`, (err) => {
                // Ignore error if column already exists
            });
            db.run(`ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 1`, (err) => {});
            db.run(`ALTER TABLE products ADD COLUMN is_visible INTEGER DEFAULT 0`, (err) => {});
            console.log('Products table ready.');
        });

        // Create Categories Table
        db.run(`CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            image TEXT
        )`, (err) => {
            if (!err) {
                // Seed Categories
                db.get(`SELECT COUNT(*) as count FROM categories`, (err, row) => {
                    if (row && row.count === 0) {
                        db.run(`INSERT INTO categories (name, image) VALUES ('Indoor Plants', 'https://images.unsplash.com/photo-1485955900006-10f4d324d411')`);
                        db.run(`INSERT INTO categories (name, image) VALUES ('Outdoor Plants', 'https://images.unsplash.com/photo-1550989460-0adf9ea622e2')`);
                        db.run(`INSERT INTO categories (name, image) VALUES ('Pots & Planters', 'https://images.unsplash.com/photo-1602498456745-e9503b30470b')`);
                        db.run(`INSERT INTO categories (name, image) VALUES ('Tools & Soil', 'https://images.unsplash.com/photo-1416879598555-aa50cb17cb25')`);
                        console.log('Categories seeded.');
                    }
                });
            }
            db.run(`ALTER TABLE categories ADD COLUMN image TEXT`, (err) => {});
            db.run(`ALTER TABLE categories ADD COLUMN is_visible INTEGER DEFAULT 0`, (err) => {});
        });

        // Create Addresses Table
        db.run(`CREATE TABLE IF NOT EXISTS addresses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT,
            latitude REAL,
            longitude REAL,
            label TEXT,
            building TEXT,
            floor TEXT,
            details TEXT,
            is_default INTEGER DEFAULT 0
        )`, (err) => {
            db.run(`ALTER TABLE addresses ADD COLUMN label TEXT`, (err) => {});
            if (!err) console.log('Addresses table ready.');
        });

        // Create Orders Table
        db.run(`CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT,
            order_data TEXT,
            total_price REAL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// --- Middleware Functions ---
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Contains id, email, role
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
};

const adminMiddleware = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    next();
};

// --- API Endpoints ---

// Register User
app.post('/api/auth/register', async (req, res) => {
    const { email, password, gender, country } = req.body;
    
    // Basic validation
    if (!email || !password || password.length < 8) {
        return res.status(400).json({ error: 'Valid email and password (min 8 characters) required.' });
    }

    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
            if (row.provider === 'google') {
                return res.status(400).json({ error: 'This email is registered with Google. Please use Google Sign In.' });
            }
            return res.status(400).json({ error: 'An account with this email already exists.' });
        }
        
        try {
            // Hash password
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            db.run(`INSERT INTO users (email, password, gender, provider, country) VALUES (?, ?, ?, 'local', ?)`, 
                [email, hashedPassword, gender, country || 'Unknown'], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                
                // Generate JWT
                const token = jwt.sign(
                    { id: this.lastID, email: email, role: 'user' },
                    JWT_SECRET,
                    { expiresIn: '7d' }
                );

                res.json({ 
                    token,
                    user: { email, gender, provider: 'local', role: 'user', country }
                });
            });
        } catch (hashError) {
            return res.status(500).json({ error: 'Error processing registration.' });
        }
    });
});

// Login User
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: 'Email does not exist. Please sign up first.' });
        
        if (user.provider === 'google') {
            return res.status(400).json({ error: 'This account was created with Google. Please use Google Sign In.' });
        }
        
        // Handle old plain-text admin password or new hashed passwords
        let isMatch = false;
        if (user.email === 'ghirasalkhier@gmail.com' && user.password === 'ahlalkhair123' && password === 'ahlalkhair123') {
             isMatch = true;
             // Hash the admin password for future logins
             const hashedAdminPass = await bcrypt.hash('ahlalkhair123', 10);
             db.run(`UPDATE users SET password = ? WHERE email = ?`, [hashedAdminPass, user.email]);
        } else {
             try {
                 isMatch = await bcrypt.compare(password, user.password);
             } catch(e) {
                 isMatch = false; // Fallback if compare fails (e.g., password wasn't hashed)
                 // Temporarily allow plain-text fallback for transition
                 if (user.password === password) {
                     isMatch = true;
                     const newHash = await bcrypt.hash(password, 10);
                     db.run(`UPDATE users SET password = ? WHERE email = ?`, [newHash, user.email]);
                 }
             }
        }

        if (!isMatch) {
            return res.status(401).json({ error: 'Incorrect password.' });
        }
        
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ 
            token,
            user: {
                email: user.email, 
                firstName: user.firstName, 
                lastName: user.lastName, 
                phone: user.phone, 
                gender: user.gender,
                provider: user.provider,
                role: user.role,
                country: user.country,
                profilePicture: user.profilePicture
            }
        });
    });
});

// Check if email exists
app.post('/api/auth/check', (req, res) => {
    const { email } = req.body;
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (user) {
            return res.json({ exists: true, provider: user.provider });
        }
        res.json({ exists: false });
    });
});

// Google Auth
app.post('/api/auth/google', async (req, res) => {
    const { token, country } = req.body;
    if (!token) return res.status(400).json({ error: 'No token provided' });
    
    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const email = payload.email;
        const firstName = payload.given_name || '';
        const lastName = payload.family_name || '';
        const profilePicture = payload.picture || '';

        db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
            if (err) return res.status(500).json({ error: err.message });
            
            if (!user) {
                // Register new user
                const initialCountry = country || 'Unknown';
                // Generate a highly secure random password for google users so they can't be guessed
                const randomPassword = require('crypto').randomBytes(32).toString('hex');
                const hashedRandomPassword = await bcrypt.hash(randomPassword, 10);

                db.run(`INSERT INTO users (email, password, firstName, lastName, provider, profilePicture, country) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [email, hashedRandomPassword, firstName, lastName, 'google', profilePicture, initialCountry], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    const token = jwt.sign(
                        { id: this.lastID, email: email, role: 'user' },
                        JWT_SECRET,
                        { expiresIn: '7d' }
                    );

                    res.json({ token, user: { email, firstName, lastName, provider: 'google', phone: null, role: 'user', profilePicture, country: initialCountry } });
                });
            } else {
                // Login existing user and update their Google info in our DB
                const newPic = profilePicture || user.profilePicture;
                const newFirst = firstName || user.firstName;
                const newLast = lastName || user.lastName;
                const newCountry = (!user.country || user.country === 'Unknown') && country ? country : user.country;

                db.run(`UPDATE users SET profilePicture = ?, firstName = ?, lastName = ?, country = ? WHERE email = ?`, [newPic, newFirst, newLast, newCountry, email], (updateErr) => {
                    const token = jwt.sign(
                        { id: user.id, email: user.email, role: user.role },
                        JWT_SECRET,
                        { expiresIn: '7d' }
                    );

                    res.json({ 
                        token,
                        user: {
                            email: user.email, 
                            firstName: newFirst, 
                            lastName: newLast, 
                            phone: user.phone, 
                            gender: user.gender,
                            provider: user.provider,
                            role: user.role,
                            profilePicture: newPic,
                            country: newCountry
                        }
                    });
                });
            }
        });
    } catch (error) {
        console.error("Error verifying Google token", error);
        return res.status(401).json({ error: 'Invalid Google Token' });
    }
});

// Get User Profile
app.get('/api/profile/:email', authMiddleware, (req, res) => {
    const email = req.user.email; // Force using token email
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        // Don't send password
        delete user.password;
        res.json(user);
    });
});

// Update User Profile
app.put('/api/profile/:email', authMiddleware, (req, res) => {
    const email = req.user.email; // Force using token email
    const { firstName, lastName, phone, gender, profilePicture } = req.body;
    
    db.run(`UPDATE users SET firstName = ?, lastName = ?, phone = ?, gender = ?, profilePicture = ? WHERE email = ?`,
        [firstName, lastName, phone, gender, profilePicture, email], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, changes: this.changes });
    });
});

// Set/Update Password for Users
app.put('/api/profile/:email/password', authMiddleware, async (req, res) => {
    const email = req.user.email; // Force using token email
    const { password, currentPassword } = req.body;
    
    if (!password || password.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    try {
        // Fetch current user
        db.get(`SELECT password, provider FROM users WHERE email = ?`, [email], async (err, user) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!user) return res.status(404).json({ error: 'User not found' });

            // If local provider, verify current password before allowing change
            if (user.provider === 'local') {
                if (!currentPassword) return res.status(400).json({ error: 'Current password is required' });
                const isMatch = await bcrypt.compare(currentPassword, user.password);
                if (!isMatch) return res.status(401).json({ error: 'Incorrect current password' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            db.run(`UPDATE users SET password = ? WHERE email = ?`, [hashedPassword, email], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Password updated successfully' });
            });
        });
    } catch (e) {
        return res.status(500).json({ error: 'Server error' });
    }
});


// Delete User Profile
app.delete('/api/profile/:email', authMiddleware, (req, res) => {
    const email = req.user.email;
    const { password } = req.body;
    
    db.get(`SELECT password, provider FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        // If local provider, verify password
        if (user.provider === 'local') {
             if (!password) return res.status(400).json({ error: 'Password required to delete account' });
             const isMatch = await bcrypt.compare(password, user.password);
             if (!isMatch) return res.status(401).json({ error: 'Incorrect password' });
        }
        
        db.run(`DELETE FROM users WHERE email = ?`, [email], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, changes: this.changes });
        });
    });
});

// --- ADDRESSES API ---

// Get User Addresses
app.get('/api/addresses/:email', authMiddleware, (req, res) => {
    const email = req.user.email; // Enforce token email
    db.all(`SELECT * FROM addresses WHERE user_email = ?`, [email], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Add Address
app.post('/api/addresses', authMiddleware, (req, res) => {
    const { latitude, longitude, building, floor, details, label } = req.body;
    const email = req.user.email; // Enforce token email
    
    db.run(`INSERT INTO addresses (user_email, latitude, longitude, label, building, floor, details) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [email, latitude, longitude, label, building, floor, details], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

// Delete Address
app.delete('/api/addresses/:id', authMiddleware, (req, res) => {
    const { id } = req.params;
    const email = req.user.email;
    
    // Ensure the address belongs to the user
    db.run(`DELETE FROM addresses WHERE id = ? AND user_email = ?`, [id, email], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Address not found or unauthorized' });
        res.json({ success: true });
    });
});

// Update Address
app.put('/api/addresses/:id', authMiddleware, (req, res) => {
    const { id } = req.params;
    const email = req.user.email;
    const { latitude, longitude, building, floor, details, label } = req.body;
    
    // Ensure the address belongs to the user
    db.run(`UPDATE addresses SET latitude=?, longitude=?, label=?, building=?, floor=?, details=? WHERE id=? AND user_email=?`,
        [latitude, longitude, label, building, floor, details, id, email], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Address not found or unauthorized' });
        res.json({ success: true, changes: this.changes });
    });
});

// --- Cart & Orders Endpoints ---

// Get Cart
app.get('/api/cart/:email', authMiddleware, (req, res) => {
    const email = req.user.email; // Enforce token email
    db.all(`SELECT * FROM carts WHERE user_email = ?`, [email], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Update Cart (Clear and Re-insert)
app.post('/api/cart/:email', authMiddleware, (req, res) => {
    const email = req.user.email; // Enforce token email
    const { items } = req.body; // Array of items
    
    db.serialize(() => {
        db.run(`DELETE FROM carts WHERE user_email = ?`, [email]);
        
        const stmt = db.prepare(`INSERT INTO carts (user_email, product_id, product_name, price, quantity, image) VALUES (?, ?, ?, ?, ?, ?)`);
        for (let item of items) {
            stmt.run([email, item.id, item.name, item.price, item.quantity, item.image]);
        }
        stmt.finalize((err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// Checkout (Create Order)
app.post('/api/checkout', authMiddleware, (req, res) => {
    const email = req.user.email; // Enforce token email
    const { items, customerDetails, address, paymentMethod } = req.body;
    
    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Cart is empty' });
    }

    db.serialize(() => {
        let actualTotalPrice = 0;
        let stockIssues = [];
        let validItems = [];

        // Verify stock and prices for all items
        const placeholders = items.map(() => '?').join(',');
        const itemIds = items.map(i => i.id);

        db.all(`SELECT id, price, stock, name FROM products WHERE id IN (${placeholders})`, itemIds, (err, products) => {
            if (err) return res.status(500).json({ error: 'Failed to verify products' });

            for (let reqItem of items) {
                const dbProduct = products.find(p => p.id === reqItem.id);
                if (!dbProduct) {
                    return res.status(400).json({ error: `Product ${reqItem.id} not found` });
                }

                if (reqItem.quantity <= 0) {
                     return res.status(400).json({ error: 'Invalid quantity' });
                }

                if (dbProduct.stock < reqItem.quantity) {
                    stockIssues.push(`Not enough stock for ${dbProduct.name}`);
                }

                actualTotalPrice += dbProduct.price * reqItem.quantity;
                validItems.push({
                    id: dbProduct.id,
                    name: dbProduct.name,
                    price: dbProduct.price,
                    quantity: reqItem.quantity,
                    image: reqItem.image
                });
            }

            if (stockIssues.length > 0) {
                return res.status(400).json({ error: stockIssues.join(', ') });
            }

            // Begin transaction-like sequence (decrease stock and insert order)
            db.run('BEGIN TRANSACTION');
            
            try {
                // Decrease stock
                for (let vItem of validItems) {
                    db.run(`UPDATE products SET stock = stock - ? WHERE id = ?`, [vItem.quantity, vItem.id]);
                }

                // Create order
                db.run(`INSERT INTO orders (user_email, order_data, total_price) VALUES (?, ?, ?)`,
                    [email, JSON.stringify({ items: validItems, customerDetails, address, paymentMethod }), actualTotalPrice], function(insertErr) {
                    
                    if (insertErr) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Failed to create order' });
                    }

                    const newOrderId = this.lastID;

                    // Update user details if provided
                    if (customerDetails && customerDetails.firstName) {
                        db.run(`UPDATE users SET firstName = ?, lastName = ?, phone = ? WHERE email = ?`,
                            [customerDetails.firstName, customerDetails.lastName, customerDetails.phone, email]);
                    }

                    // Clear cart
                    db.run(`DELETE FROM carts WHERE user_email = ?`, [email]);
                    
                    db.run('COMMIT');
                    res.json({ success: true, order_id: newOrderId });
                });
            } catch (e) {
                db.run('ROLLBACK');
                res.status(500).json({ error: 'Transaction failed' });
            }
        });
    });
});


// Check if Email Exists (For OTP step)
app.get('/api/auth/check-email/:email', (req, res) => {
    const { email } = req.params;
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
            if (row.provider === 'google') {
                return res.json({ exists: true, provider: 'google' });
            }
            return res.json({ exists: true, provider: 'local' });
        }
        res.json({ exists: false });
    });
});



// --- Admin & Dynamic Data Endpoints ---

// Get all products
app.get('/api/products', (req, res) => {
    let query = `SELECT * FROM products`;
    if (!req.query.all) {
        query += ` WHERE is_visible = 1 OR is_visible IS NULL`;
    }
    
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Toggle product visibility
app.put('/api/products/:id/visibility', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;
    const { is_visible } = req.body;
    db.run(`UPDATE products SET is_visible = ? WHERE id = ?`, [is_visible, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Add a product
app.post('/api/products', authMiddleware, adminMiddleware, upload.array('images', 10), (req, res) => {
    const { name, description, price, category, stock, watering } = req.body;
    let imagePaths = [];
    if (req.files && req.files.length > 0) {
        imagePaths = req.files.map(f => '/uploads/' + f.filename);
    } else {
        // Fallback for any JSON requests (e.g. from existing scripts)
        if (req.body.image) {
            imagePaths = [req.body.image];
        }
    }
    
    db.run(`INSERT INTO products (name, description, price, image, category, stock, watering) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [name, description, price, JSON.stringify(imagePaths), category, stock || 1, watering], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});


// Get a single product
app.get('/api/products/:id', (req, res) => {
    const { id } = req.params;
    db.get(`SELECT * FROM products WHERE id=?`, [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Product not found' });
        res.json(row);
    });
});

// Update a product
app.put('/api/products/:id', authMiddleware, adminMiddleware, upload.array('images', 10), (req, res) => {
    const { name, description, price, category, stock, watering } = req.body;
    const { id } = req.params;
    
    let updateQuery = `UPDATE products SET name=?, description=?, price=?, category=?, stock=?, watering=?`;
    let params = [name, description, price, category, stock || 1, watering];
    
    let finalImages = [];
    if (req.body.existingImages) {
        try {
            const parsed = JSON.parse(req.body.existingImages);
            if (Array.isArray(parsed)) finalImages = parsed;
        } catch(e) {
            // fallback if it's a raw string
            if (req.body.existingImages.trim().length > 0 && req.body.existingImages !== 'null') {
                finalImages = [req.body.existingImages];
            }
        }
    }
    
    if (req.files && req.files.length > 0) {
        const imagePaths = req.files.map(f => '/uploads/' + f.filename);
        finalImages = finalImages.concat(imagePaths);
    }
    
    if (finalImages.length > 0) {
        updateQuery += `, image=?`;
        params.push(JSON.stringify(finalImages));
    }
    
    updateQuery += ` WHERE id=?`;
    params.push(id);
    
    db.run(updateQuery, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ changes: this.changes });
    });
});


// Delete a product
app.delete('/api/products/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM products WHERE id=?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

// Get all categories
app.get('/api/categories', (req, res) => {
    let query = `SELECT * FROM categories`;
    if (!req.query.all) {
        query += ` WHERE is_visible = 1`;
    }
    
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Toggle category visibility
app.put('/api/categories/:id/visibility', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;
    const { is_visible } = req.body;
    db.run(`UPDATE categories SET is_visible = ? WHERE id = ?`, [is_visible, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Add a category
app.post('/api/categories', authMiddleware, adminMiddleware, upload.single('image'), (req, res) => {
    const { name } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null;
    
    db.run(`INSERT INTO categories (name, image, is_visible) VALUES (?, ?, 0)`, [name, image], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

// Update a category
app.put('/api/categories/:id', authMiddleware, adminMiddleware, upload.single('image'), (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    let query = `UPDATE categories SET name = ?`;
    let params = [name];

    if (req.file) {
        query += `, image = ?`;
        params.push(`/uploads/${req.file.filename}`);
    }
    
    query += ` WHERE id = ?`;
    params.push(id);

    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

// Delete a category
app.delete('/api/categories/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM categories WHERE id=?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

// Get all orders (Admin)
app.get('/api/admin/orders', authMiddleware, adminMiddleware, (req, res) => {
    db.all(`SELECT * FROM orders ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Update order status (Admin)
app.put('/api/admin/orders/:id/status', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    db.get(`SELECT * FROM orders WHERE id=?`, [id], (err, order) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        
        db.run(`UPDATE orders SET status=? WHERE id=?`, [status, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            // Restore stock if the order is newly cancelled
            if (status === 'cancelled' && order.status !== 'cancelled') {
                try {
                    const orderData = JSON.parse(order.order_data);
                    const items = orderData.items || [];
                    
                    items.forEach(item => {
                        db.run(`UPDATE products SET stock = stock + ? WHERE id = ?`, [item.quantity, item.id]);
                    });
                } catch (e) {
                    console.error("Error restoring stock:", e);
                }
            }
            
            res.json({ success: true, changes: this.changes });
        });
    });
});
// Delete an order completely (Admin)
app.delete('/api/admin/orders/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;
    
    db.get(`SELECT * FROM orders WHERE id=?`, [id], (err, order) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        
        db.run(`DELETE FROM orders WHERE id=?`, [id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            // Restore stock if the order wasn't already cancelled
            if (order.status !== 'cancelled') {
                try {
                    const orderData = JSON.parse(order.order_data);
                    const items = orderData.items || [];
                    
                    items.forEach(item => {
                        db.run(`UPDATE products SET stock = stock + ? WHERE id = ?`, [item.quantity, item.id]);
                    });
                } catch (e) {
                    console.error("Error restoring stock on deletion:", e);
                }
            }
            
            res.json({ success: true, changes: this.changes });
        });
    });
});

// Get orders for a specific user
app.get('/api/orders/:email', authMiddleware, (req, res) => {
    const email = req.user.email; // Enforce token email
    db.all(`SELECT * FROM orders WHERE user_email=? ORDER BY created_at DESC`, [email], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get all users (Admin only)
app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
    db.all(`SELECT id, email, firstName, lastName, phone, gender, role, provider, country, profilePicture FROM users ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Update User Password
app.put('/api/profile/:email/password', authMiddleware, async (req, res) => {
    const { email } = req.params;
    const { currentPassword, newPassword } = req.body;
    
    // Ensure the token matches the requested email
    if (req.user.email !== email) {
        return res.status(403).json({ error: 'Unauthorized to change this password' });
    }

    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.provider === 'google') return res.status(400).json({ error: 'Google accounts cannot change password here.' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Incorrect current password' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        db.run(`UPDATE users SET password = ? WHERE email = ?`, [hashedPassword, email], function(updateErr) {
            if (updateErr) return res.status(500).json({ error: updateErr.message });
            res.json({ success: true, message: 'Password updated successfully' });
        });
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File is too large. Maximum size is 5MB.' });
        }
        return res.status(400).json({ error: err.message });
    } else if (err) {
        return res.status(400).json({ error: err.message || 'An unexpected error occurred.' });
    }
    next();
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📂 Serving static files from public directory`);
});
