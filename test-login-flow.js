const axios = require('axios');

async function testLoginFlow() {
    const baseURL = 'http://localhost:7575';

    // Create axios instance with cookie jar
    const client = axios.create({
        baseURL,
        maxRedirects: 0, // Don't follow redirects automatically
        validateStatus: (status) => status < 500, // Don't throw on 3xx
        withCredentials: true
    });

    try {
        console.log('=== Step 1: GET /login page ===');
        const loginPageResponse = await client.get('/login');
        console.log('Status:', loginPageResponse.status);

        // Extract CSRF token
        const csrfMatch = loginPageResponse.data.match(/name="_csrf" value="([^"]+)"/);
        const csrfToken = csrfMatch ? csrfMatch[1] : null;
        console.log('CSRF Token:', csrfToken ? 'Found' : 'Not found');

        // Extract session cookie
        const setCookieHeader = loginPageResponse.headers['set-cookie'];
        console.log('Set-Cookie header:', setCookieHeader);

        if (!csrfToken) {
            console.error('ERROR: No CSRF token found');
            return;
        }

        console.log('\n=== Step 2: POST /login ===');
        const loginResponse = await client.post('/login',
            `username=ozang88&password=Moejokerto%2388&_csrf=${csrfToken}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': setCookieHeader ? setCookieHeader[0].split(';')[0] : ''
                }
            }
        );

        console.log('Status:', loginResponse.status);
        console.log('Location header:', loginResponse.headers.location);
        console.log('Set-Cookie after login:', loginResponse.headers['set-cookie']);

        if (loginResponse.status === 302 && loginResponse.headers.location) {
            console.log('\n=== Step 3: Follow redirect to', loginResponse.headers.location, '===');

            // Extract updated session cookie
            const loginCookie = loginResponse.headers['set-cookie'];
            const cookieToSend = loginCookie ? loginCookie[0].split(';')[0] : (setCookieHeader ? setCookieHeader[0].split(';')[0] : '');

            console.log('Cookie being sent:', cookieToSend);

            const dashboardResponse = await client.get(loginResponse.headers.location, {
                headers: {
                    'Cookie': cookieToSend
                }
            });

            console.log('Dashboard status:', dashboardResponse.status);
            console.log('Dashboard response length:', dashboardResponse.data.length);

            if (dashboardResponse.status === 302) {
                console.log('REDIRECT LOOP DETECTED!');
                console.log('Redirecting to:', dashboardResponse.headers.location);
            } else if (dashboardResponse.status === 200) {
                console.log('SUCCESS: Dashboard loaded');
                // Check if it's actually the dashboard or login page
                if (dashboardResponse.data.includes('Dashboard') || dashboardResponse.data.includes('Streaming Status')) {
                    console.log('✅ Confirmed: Dashboard page loaded');
                } else if (dashboardResponse.data.includes('Login')) {
                    console.log('❌ ERROR: Got login page instead of dashboard');
                }
            }
        } else {
            console.log('ERROR: No redirect after login');
            console.log('Response data:', loginResponse.data.substring(0, 500));
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response headers:', error.response.headers);
        }
    }
}

testLoginFlow();
