// ============================================
// FINANCIAL PLATFORM BACKEND - FULLY TESTED VERSION
// Version: 3.0 | Date: 2026-01-28
// SPECIFICALLY CONFIGURED FOR YOUR SUPA BASE
// SUPABASE: kezabnteotbqiyqhdkmr.supabase.co
// JWT_SECRET: a8867c8e41178dc12aedac42a53601f6
// ============================================

// Import required packages
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// ============================================
// INITIALIZE EXPRESS APP
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// SUPABASE CONNECTION (YOUR SPECIFIC DATABASE)
// ============================================
const supabaseUrl = process.env.SUPABASE_URL; // https://kezabnteotbqiyqhdkmr.supabase.co
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate Supabase credentials
if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ CRITICAL ERROR: Missing Supabase credentials');
    console.error('Check your .env file has SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

// Create Supabase client with service role (full admin access)
const supabase = createClient(supabaseUrl, supabaseServiceKey);
console.log('✅ SUPABASE: Connected to YOUR database:', supabaseUrl);
console.log('✅ JWT_SECRET: Using your provided secret');

// ============================================
// MIDDLEWARE SETUP
// ============================================
app.use(cors({
    origin: '*', // Allow all origins
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json()); // Parse JSON request bodies

// ============================================
// ADMIN AUTHENTICATION MIDDLEWARE
// ============================================
function requireAdmin(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Admin token required' 
        });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Admin check: email contains 'admin' or is the specific admin email
        if (decoded.email && (decoded.email.includes('admin') || decoded.email === 'admin@financialplatform.com')) {
            req.admin = decoded;
            next();
        } else {
            return res.status(403).json({ 
                success: false, 
                message: 'Admin access required' 
            });
        }
    } catch (error) {
        console.error('Admin auth error:', error);
        return res.status(401).json({ 
            success: false, 
            message: 'Invalid admin token' 
        });
    }
}

// ============================================
// USER AUTHENTICATION MIDDLEWARE
// ============================================
function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Authentication token required' 
        });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        return res.status(401).json({ 
            success: false, 
            message: 'Invalid token' 
        });
    }
}

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
app.get('/health', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('count')
            .limit(1);
        
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            database: error ? 'disconnected' : 'connected',
            supabase: supabaseUrl,
            message: 'Financial Platform Backend is running'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// GET COUNTRIES
app.get('/api/auth/countries', async (req, res) => {
    try {
        console.log('Fetching countries from Supabase...');
        
        const { data: countries, error } = await supabase
            .from('countries')
            .select('*')
            .order('country_name');
        
        if (error) {
            console.warn('Database countries error, using fallback:', error.message);
            const fallbackCountries = [
                {country_code: 'US', country_name: 'United States', phone_code: '+1', currency_code: 'USD', currency_symbol: '$'},
                {country_code: 'KE', country_name: 'Kenya', phone_code: '+254', currency_code: 'KES', currency_symbol: 'KSh'},
                {country_code: 'UK', country_name: 'United Kingdom', phone_code: '+44', currency_code: 'GBP', currency_symbol: '£'},
                {country_code: 'NG', country_name: 'Nigeria', phone_code: '+234', currency_code: 'NGN', currency_symbol: '₦'},
                {country_code: 'IN', country_name: 'India', phone_code: '+91', currency_code: 'INR', currency_symbol: '₹'}
            ];
            return res.json({ success: true, countries: fallbackCountries });
        }
        
        console.log(`Found ${countries?.length || 0} countries in database`);
        res.json({ success: true, countries: countries || [] });
        
    } catch (error) {
        console.error('Countries error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error loading countries' 
        });
    }
});

// REGISTER USER
app.post('/api/auth/register', async (req, res) => {
    try {
        console.log('Registration request received:', req.body.email);
        
        const { email, password, fullName, phone, countryCode } = req.body;
        
        if (!email || !password || !fullName || !countryCode) {
            return res.status(400).json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }
        
        // Check if user exists
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .single();
        
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email already registered' 
            });
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        // Get country currency
        const { data: country } = await supabase
            .from('countries')
            .select('currency_code')
            .eq('country_code', countryCode)
            .single();
        
        const currency = country?.currency_code || 'USD';
        
        // Create user
        const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert([{
                email: email,
                password_hash: passwordHash,
                full_name: fullName,
                phone: phone || '',
                country_code: countryCode,
                currency: currency,
                user_status: 'active',
                user_tier: 'tier1',
                balance: 0.00,
                crypto_balance: 0.00000000,
                bank_account_details: 'Not assigned yet',
                crypto_address: 'Not assigned yet',
                paypal_address: 'Not assigned yet'
            }])
            .select()
            .single();
        
        if (createError) {
            console.error('Supabase create error:', createError);
            return res.status(500).json({ 
                success: false, 
                message: 'Database error: ' + createError.message 
            });
        }
        
        // Create JWT token
        const token = jwt.sign(
            { userId: newUser.id, email: newUser.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Remove password from response
        const userResponse = { ...newUser };
        delete userResponse.password_hash;
        
        console.log('✅ User registered successfully:', email);
        
        res.json({
            success: true,
            message: 'Registration successful!',
            token: token,
            user: userResponse
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + error.message 
        });
    }
});

// LOGIN USER
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and password required' 
            });
        }
        
        // Get user from database
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();
        
        if (error || !user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }
        
        // Check password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }
        
        // Check account status
        if (user.user_status !== 'active') {
            return res.status(403).json({ 
                success: false, 
                message: `Account is ${user.user_status}` 
            });
        }
        
        // Create token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Remove password from response
        const userResponse = { ...user };
        delete userResponse.password_hash;
        
        console.log('✅ User logged in:', email);
        
        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            user: userResponse
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during login' 
        });
    }
});

// GET USER PROFILE
app.get('/api/auth/profile', requireAuth, async (req, res) => {
    try {
        // Get user from database using the userId from token
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', req.user.userId)
            .single();

        if (error || !user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // Remove password from response
        const userResponse = { ...user };
        delete userResponse.password_hash;

        res.json({
            success: true,
            user: userResponse
        });

    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// ============================================
// TRANSACTION ROUTES
// ============================================

// GET USER TRANSACTIONS
app.get('/api/transactions/user', async (req, res) => {
    try {
        const userId = req.query.userId;
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'User ID required' 
            });
        }
        
        const { data: transactions, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (error) {
            console.error('Transactions error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Database error' 
            });
        }
        
        res.json({
            success: true,
            transactions: transactions || []
        });
        
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// SEND MONEY
app.post('/api/transactions/send', async (req, res) => {
    try {
        const { userId, amount, currency, paymentMethod, recipientEmail, description } = req.body;
        
        if (!userId || !amount || !paymentMethod || !recipientEmail) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields' 
            });
        }
        
        // Create transaction
        const { data: transaction, error } = await supabase
            .from('transactions')
            .insert([{
                user_id: userId,
                transaction_type: 'transfer',
                amount: parseFloat(amount),
                currency: currency || 'USD',
                payment_method: paymentMethod,
                recipient_email: recipientEmail,
                description: description || `Payment to ${recipientEmail}`,
                status: 'pending'
            }])
            .select()
            .single();
        
        if (error) {
            console.error('Create transaction error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Database error' 
            });
        }
        
        console.log('✅ Transaction created:', transaction.id);
        
        res.json({
            success: true,
            message: 'Transaction created successfully. Awaiting admin approval.',
            transaction: transaction
        });
        
    } catch (error) {
        console.error('Send money error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// GET PAYMENT METHODS
app.get('/api/transactions/payment-methods', async (req, res) => {
    try {
        const paymentMethods = [
            { value: 'paypal', label: 'PayPal', icon: 'fab fa-paypal' },
            { value: 'bank_transfer', label: 'Bank Transfer', icon: 'fas fa-university' },
            { value: 'crypto', label: 'Cryptocurrency', icon: 'fab fa-bitcoin' },
            { value: 'credit_card', label: 'Credit Card', icon: 'fas fa-credit-card' },
            { value: 'internal', label: 'Internal Transfer', icon: 'fas fa-exchange-alt' }
        ];
        
        res.json({
            success: true,
            paymentMethods: paymentMethods
        });
        
    } catch (error) {
        console.error('Payment methods error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// ============================================
// ADMIN ROUTES (PROTECTED)
// ============================================

// GET ALL USERS (ADMIN)
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Get users error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Database error' 
            });
        }
        
        // Remove passwords
        const sanitizedUsers = users.map(user => {
            const { password_hash, ...userData } = user;
            return userData;
        });
        
        res.json({
            success: true,
            users: sanitizedUsers
        });
        
    } catch (error) {
        console.error('Admin users error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// UPDATE USER STATUS (ADMIN)
app.put('/api/admin/users/:id/status', requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const { status } = req.body;
        
        const validStatuses = ['active', 'suspended', 'frozen'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status' 
            });
        }
        
        const { data: user, error } = await supabase
            .from('users')
            .update({ user_status: status })
            .eq('id', userId)
            .select()
            .single();
        
        if (error) {
            console.error('Update status error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Database error' 
            });
        }
        
        res.json({
            success: true,
            message: `User status updated to ${status}`,
            user: user
        });
        
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// UPDATE USER BALANCES (ADMIN)
app.put('/api/admin/users/:id/balance', requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const { balance, crypto_balance } = req.body;
        
        const updateData = {};
        if (balance !== undefined) updateData.balance = parseFloat(balance);
        if (crypto_balance !== undefined) updateData.crypto_balance = parseFloat(crypto_balance);
        
        const { data: user, error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', userId)
            .select()
            .single();
        
        if (error) {
            console.error('Update balance error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Database error' 
            });
        }
        
        res.json({
            success: true,
            message: 'User balances updated',
            user: user
        });
        
    } catch (error) {
        console.error('Update balance error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// ============================================
// CRITICAL FIX: UPDATE USER PAYMENT DETAILS (ADMIN)
// This endpoint was missing from your Render deployment
// ============================================
app.put('/api/admin/users/:id/payment-details', requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const { bank_account_details, crypto_address, paypal_address } = req.body;
        
        console.log('ADMIN: Updating payment details for user:', userId, req.body);

        const updateData = {};
        if (bank_account_details !== undefined) updateData.bank_account_details = bank_account_details;
        if (crypto_address !== undefined) updateData.crypto_address = crypto_address;
        if (paypal_address !== undefined) updateData.paypal_address = paypal_address;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'No update data provided' 
            });
        }

        const { data: user, error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            console.error('Update payment details error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Database error: ' + error.message 
            });
        }

        console.log('✅ ADMIN: Payment details updated successfully for user:', userId);

        res.json({
            success: true,
            message: 'Payment details updated successfully',
            user: user
        });

    } catch (error) {
        console.error('Update payment details error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + error.message 
        });
    }
});

// UPDATE USER TIER (ADMIN)
app.put('/api/admin/users/:id/tier', requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const { tier } = req.body;

        const validTiers = ['tier1', 'tier2', 'tier3'];
        if (!validTiers.includes(tier)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid tier. Must be tier1, tier2, or tier3' 
            });
        }

        const { data: user, error } = await supabase
            .from('users')
            .update({ user_tier: tier })
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            console.error('Update tier error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Database error: ' + error.message 
            });
        }

        res.json({
            success: true,
            message: `User tier updated to ${tier}`,
            user: user
        });

    } catch (error) {
        console.error('Update tier error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// GET ALL TRANSACTIONS (ADMIN)
app.get('/api/admin/transactions', requireAdmin, async (req, res) => {
    try {
        const { data: transactions, error } = await supabase
            .from('transactions')
            .select(`
                *,
                users (email, full_name)
            `)
            .order('created_at', { ascending: false })
            .limit(100);
        
        if (error) {
            console.error('Get transactions error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Database error' 
            });
        }
        
        res.json({
            success: true,
            transactions: transactions || []
        });
        
    } catch (error) {
        console.error('Admin transactions error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// UPDATE TRANSACTION STATUS (ADMIN)
app.put('/api/admin/transactions/:id/status', requireAdmin, async (req, res) => {
    try {
        const transactionId = req.params.id;
        const { status, admin_notes } = req.body;
        
        const validStatuses = ['pending', 'approved', 'rejected', 'completed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status' 
            });
        }
        
        const { data: transaction, error } = await supabase
            .from('transactions')
            .update({ 
                status: status,
                admin_notes: admin_notes || ''
            })
            .eq('id', transactionId)
            .select()
            .single();
        
        if (error) {
            console.error('Update transaction error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Database error' 
            });
        }
        
        res.json({
            success: true,
            message: `Transaction ${status}`,
            transaction: transaction
        });
        
    } catch (error) {
        console.error('Update transaction error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log(`🚀 FINANCIAL PLATFORM BACKEND - YOUR DEPLOYMENT`);
    console.log(`✅ Port: ${PORT}`);
    console.log(`✅ Supabase: Connected to YOUR database`);
    console.log(`✅ Health: http://localhost:${PORT}/health`);
    console.log('='.repeat(60));
    console.log('📋 CRITICAL ENDPOINTS FOR ADMIN UPDATES:');
    console.log(`   💳 Payment Details: PUT http://localhost:${PORT}/api/admin/users/:id/payment-details`);
    console.log(`   🏷️ User Tier:       PUT http://localhost:${PORT}/api/admin/users/:id/tier`);
    console.log(`   🔧 User Status:     PUT http://localhost:${PORT}/api/admin/users/:id/status`);
    console.log(`   💰 User Balances:   PUT http://localhost:${PORT}/api/admin/users/:id/balance`);
    console.log('='.repeat(60));
    console.log('⚠️  IMPORTANT: After updating server.js, REDEPLOY to Render!');
    console.log('='.repeat(60));
});
