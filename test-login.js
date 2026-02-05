const express = require('express');
const session = require('express-session');
const User = require('./models/User');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple session for testing
app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

app.post('/test-login', async (req, res) => {
    const { username, password } = req.body;

    console.log('Testing login for:', username);

    try {
        const user = await User.findByUsername(username);

        if (!user) {
            return res.json({ success: false, error: 'User not found' });
        }

        console.log('User found:', user.username, 'role:', user.user_role, 'status:', user.status);

        const passwordMatch = await User.verifyPassword(password, user.password);

        if (!passwordMatch) {
            return res.json({ success: false, error: 'Password mismatch' });
        }

        if (user.status !== 'active') {
            return res.json({ success: false, error: 'User not active' });
        }

        // Set session
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.user_role = user.user_role;

        req.session.save((err) => {
            if (err) {
                return res.json({ success: false, error: 'Session save error: ' + err.message });
            }

            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.user_role,
                    status: user.status
                },
                session: {
                    userId: req.session.userId,
                    username: req.session.username
                }
            });
        });

    } catch (error) {
        console.error('Login test error:', error);
        res.json({ success: false, error: error.message, stack: error.stack });
    }
});

const port = 7576;
app.listen(port, () => {
    console.log(`Test server running on http://localhost:${port}`);
    console.log('Test with: curl -X POST http://localhost:7576/test-login -H "Content-Type: application/json" -d "{\\"username\\":\\"ozang88\\",\\"password\\":\\"Moejokerto#88\\"}"');
});
