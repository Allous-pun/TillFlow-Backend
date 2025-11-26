// test-help.mjs
import https from 'https';

const API_BASE_URL = 'https://tillflow-backend.onrender.com/api';

function testEndpoint(endpoint) {
  return new Promise((resolve, reject) => {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`Testing: ${url}`);
    
    const req = https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response: ${data}`);
        console.log('---');
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`Error: ${error.message}`);
      reject(error);
    });
    
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing TillFlow Backend Endpoints...\n');
  
  try {
    // Test health endpoint
    await testEndpoint('/health');
    
    // Test help endpoint (should work after fixing routes)
    await testEndpoint('/help');
    
    // Test admin endpoints (will likely fail without auth, but should show different error)
    await testEndpoint('/help/admin/help/statistics');
    
  } catch (error) {
    console.log('Test failed:', error.message);
  }
}

runTests();