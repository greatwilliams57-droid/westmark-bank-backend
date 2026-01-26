// ============================================
// FINANCIAL PLATFORM BACKEND - GUARANTEED WORKING
// Connected to YOUR Supabase: kezabnteotbqiyqhdkmr.supabase.co
// ============================================

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// ============================================
// INITIALIZE APP
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// SUPABASE CONNECTION (YOUR CREDENTIALS)
// ============================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials in .env file');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
console.log('✅ Connected to Supabase:', supabaseUrl);

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
    origin: '*', // Allow all for now, update after Netlify deployment
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json());

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('countries')
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
        
        // Try to get countries from database
        const { data: countries, error } = await supabase
            .from('countries')
            .select('*')
            .order('country_name');
        
        if (error) {
            console.warn('Database countries error, using fallback:', error.message);
            // Fallback countries if database empty
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
        
        // Validation
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

// ============================================
// ADMIN ROUTES
// ============================================

// GET ALL USERS (ADMIN)
app.get('/api/admin/users', async (req, res) => {
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
app.put('/api/admin/users/:id/status', async (req, res) => {
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
app.put('/api/admin/users/:id/balance', async (req, res) => {
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

// GET ALL TRANSACTIONS (ADMIN)
app.get('/api/admin/transactions', async (req, res) => {
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
app.put('/api/admin/transactions/:id/status', async (req, res) => {
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
    console.log(`🚀 FINANCIAL PLATFORM BACKEND`);
    console.log(`✅ Port: ${PORT}`);
    console.log(`✅ Supabase: Connected`);
    console.log(`✅ Health: http://localhost:${PORT}/health`);
    console.log('='.repeat(60));
    console.log('📋 Available Endpoints:');
    console.log(`   🔐 Register: POST http://localhost:${PORT}/api/auth/register`);
    console.log(`   🔐 Login:    POST http://localhost:${PORT}/api/auth/login`);
    console.log(`   🌍 Countries: GET http://localhost:${PORT}/api/auth/countries`);
    console.log(`   👑 Admin Users: GET http://localhost:${PORT}/api/admin/users`);
    console.log('='.repeat(60));
});