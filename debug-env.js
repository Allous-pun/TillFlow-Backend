import dotenv from 'dotenv';

// Load environment variables
const result = dotenv.config();

if (result.error) {
  console.error('❌ Error loading .env file:', result.error);
} else {
  console.log('✅ .env file loaded successfully');
}

console.log('\n📋 All Environment Variables:');
console.log('RESEND_API_KEY:', process.env.RESEND_API_KEY ? '***' + process.env.RESEND_API_KEY.slice(-8) : '❌ NOT FOUND');
console.log('MONGO_URL:', process.env.MONGO_URL ? '✅ Found' : '❌ NOT FOUND');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? '✅ Found' : '❌ NOT FOUND');
console.log('PORT:', process.env.PORT || '❌ NOT FOUND');
console.log('NODE_ENV:', process.env.NODE_ENV || '❌ NOT FOUND');

// Test if the .env file is being read
console.log('\n🔍 Checking .env file path...');
console.log('Current directory:', process.cwd());