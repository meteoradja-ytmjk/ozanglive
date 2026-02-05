const axios = require('axios');

async function diagnoseSettingsIssue() {
    // Ganti dengan IP VPS Anda
    const baseURL = 'http://212.2.252.219:7575';

    const client = axios.create({
        baseURL,
        maxRedirects: 0,
        validateStatus: (status) => status < 500,
        withCredentials: true
    });

    try {
        console.log('=== DIAGNOSTIC: Settings Page on VPS ===\n');

        console.log('Step 1: GET /login page');
        const loginPageResponse = await client.get('/login');
        const csrfMatch = loginPageResponse.data.match(/name="_csrf" value="([^"]+)"/);
        const csrfToken = csrfMatch ? csrfMatch[1] : null;
        const setCookieHeader = loginPageResponse.headers['set-cookie'];

        console.log('✓ CSRF Token:', csrfToken ? 'Found' : 'Not found');
        console.log('✓ Cookie:', setCookieHeader ? 'Received' : 'None');

        console.log('\nStep 2: POST /login');
        const loginResponse = await client.post('/login',
            `username=ozang88&password=Moejokerto%2388&_csrf=${csrfToken}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': setCookieHeader ? setCookieHeader[0].split(';')[0] : ''
                }
            }
        );

        console.log('✓ Login Status:', loginResponse.status);
        console.log('✓ Redirect to:', loginResponse.headers.location);

        const loginCookie = loginResponse.headers['set-cookie'];
        const cookieToSend = loginCookie ? loginCookie[0].split(';')[0] : (setCookieHeader ? setCookieHeader[0].split(';')[0] : '');

        console.log('\nStep 3: GET /dashboard (to establish session)');
        const dashboardResponse = await client.get('/dashboard', {
            headers: {
                'Cookie': cookieToSend
            }
        });

        console.log('✓ Dashboard Status:', dashboardResponse.status);
        if (dashboardResponse.status === 302) {
            console.log('✗ ERROR: Dashboard redirects to:', dashboardResponse.headers.location);
        }

        // Update cookie if dashboard set new one
        const dashboardCookie = dashboardResponse.headers['set-cookie'];
        const finalCookie = dashboardCookie ? dashboardCookie[0].split(';')[0] : cookieToSend;

        console.log('\nStep 4: GET /settings');
        const settingsResponse = await client.get('/settings', {
            headers: {
                'Cookie': finalCookie
            }
        });

        console.log('✓ Settings Status:', settingsResponse.status);

        if (settingsResponse.status === 302) {
            console.log('\n❌ PROBLEM FOUND!');
            console.log('Settings redirects to:', settingsResponse.headers.location);
            console.log('\nThis means:');
            console.log('- Session is not being maintained properly');
            console.log('- OR user_role is not being set in session');
            console.log('- OR there is an error in settings.ejs rendering');
        } else if (settingsResponse.status === 200) {
            console.log('\n✅ SUCCESS!');
            console.log('Settings page loaded successfully');
            console.log('Response length:', settingsResponse.data.length);

            // Check if it actually contains settings content
            if (settingsResponse.data.includes('Settings') || settingsResponse.data.includes('Profile')) {
                console.log('✓ Confirmed: Settings page content found');
            } else {
                console.log('✗ WARNING: Response does not look like settings page');
            }
        } else if (settingsResponse.status === 500) {
            console.log('\n❌ SERVER ERROR!');
            console.log('Settings page returned 500 error');
            console.log('Error preview:', settingsResponse.data.substring(0, 500));
        }

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data ? error.response.data.substring(0, 500) : 'No data');
        }
    }
}

diagnoseSettingsIssue();
