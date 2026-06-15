const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Generate random secret key
const generateSecret = () => {
    return crypto.randomBytes(64).toString('hex');
};

// Main function
const main = () => {
    console.log('🔐 Generating SESSION_SECRET...');

    const secret = generateSecret();
    const envPath = path.join(__dirname, '.env');
    const envExamplePath = path.join(__dirname, '.env.example');

    // Check if .env exists
    if (!fs.existsSync(envPath)) {
        // Copy from .env.example if exists
        if (fs.existsSync(envExamplePath)) {
            console.log('📋 Copying .env.example to .env...');
            fs.copyFileSync(envExamplePath, envPath);
        } else {
            // Create new .env file
            console.log('📝 Creating new .env file...');
            fs.writeFileSync(envPath, '');
        }
    }

    // Read current .env content
    let envContent = fs.readFileSync(envPath, 'utf8');

    // Check if SESSION_SECRET already exists
    if (envContent.includes('SESSION_SECRET=')) {
        // Replace existing SESSION_SECRET
        envContent = envContent.replace(
            /SESSION_SECRET=.*/,
            `SESSION_SECRET=${secret}`
        );
        console.log('✏️  Updating existing SESSION_SECRET...');
    } else {
        // Add new SESSION_SECRET
        if (envContent && !envContent.endsWith('\n')) {
            envContent += '\n';
        }
        envContent += `SESSION_SECRET=${secret}\n`;
        console.log('➕ Adding new SESSION_SECRET...');
    }

    // Write back to .env
    fs.writeFileSync(envPath, envContent);

    console.log('✅ SESSION_SECRET generated successfully!');
    console.log(`📍 Location: ${envPath}`);
    console.log('');
    console.log('🔒 Keep this secret safe and never commit it to version control!');
};

// Run
try {
    main();
} catch (error) {
    console.error('❌ Error generating secret:', error.message);
    process.exit(1);
}
