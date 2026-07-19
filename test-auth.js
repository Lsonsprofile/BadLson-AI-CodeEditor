import fetch from 'node-fetch';

async function testAuth() {
  const BASE_URL = 'http://localhost:5002/api';
  
  try {
    // 1. Register
    console.log('📝 Registering user...');
    const registerRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'testpassword123',
        name: 'Test User'
      })
    });
    const registerData = await registerRes.json();
    console.log('✅ Registration response:', registerData);

    // 2. Login
    console.log('\n🔐 Logging in...');
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'testpassword123'
      })
    });
    const loginData = await loginRes.json();
    console.log('✅ Login response:', loginData);

    const token = loginData.token;
    console.log('\n📋 Token:', token);

    // 3. Test protected endpoint
    console.log('\n🔒 Testing protected endpoint...');
    const protectedRes = await fetch(`${BASE_URL}/health`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const protectedData = await protectedRes.json();
    console.log('✅ Protected endpoint response:', protectedData);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAuth();