const axios = require('axios');

async function testSettingsAccess() {
    const baseURL = 'http://localhost:7575';

    const client = axios.create({
        baseURL,
        maxRedirects: 0,
        validateStatus: (status) => status < 500,
        withCredentials: true
    });

    try {
        console.log('=== Step 1: GET /login page ===');
        const loginPageResponse = await client.get('/login');
        const csrfMatch = loginPageResponse.data.match(/name="_csrf" value="([^"]+)"/);
        const csrfToken = csrfMatch ? csrfMatch[1] : null;
        const setCookieHeader = loginPageResponse.headers['set-cookie'];

        console.log('CSRF Token:', csrfToken ? 'Found' : 'Not found');

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

        console.log('Login Status:', loginResponse.status);
        console.log('Login Location:', loginResponse.headers.location);

        const loginCookie = loginResponse.headers['set-cookie'];
        const cookieToSend = loginCookie ? loginCookie[0].split(';')[0] : (setCookieHeader ? setCookieHeader[0].split(';')[0] : '');

        console.log('\n=== Step 3: GET /settings ===');
        const settingsResponse = await client.get('/settings', {
            headers: {
                'Cookie': cookieToSend
            }
        });

        console.log('Settings Status:', settingsResponse.status);

        if (settingsResponse.status === 302) {
            console.log('❌ REDIRECT DETECTED!');
            console.log('Redirecting to:', settingsResponse.headers.location);
        } else if (settingsResponse.status === 200) {
            console.log('✅ SUCCESS: Settings page loaded');
            console.log('Response length:', settingsResponse.data.length);

            // Check if it's actually the settings page
            if (settingsResponse.data.includes('Settings') || settingsResponse.data.includes('Profile')) {
                console.log('✅ Confirmed: Settings page content');
            } else if (settingsResponse.data.includes('Login')) {
                console.log('❌ ERROR: Got login page instead');
            }
        } else if (settingsResponse.status === 500) {
            console.log('❌ SERVER ERROR 500');
            console.log('Error response:', settingsResponse.data.substring(0, 500));
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data ? error.response.data.substring(0, 500) : 'No data');
        }
    }
}

testSettingsAccess();
