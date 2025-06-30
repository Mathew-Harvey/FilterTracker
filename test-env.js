require('dotenv').config();

console.log('Testing dotenv configuration...');
console.log('MONGODB_URI defined:', !!process.env.MONGODB_URI);
console.log('MONGODB_URI value:', process.env.MONGODB_URI ? 'FOUND' : 'NOT FOUND');

if (process.env.MONGODB_URI) {
    console.log('✅ Environment variable loaded successfully');
} else {
    console.log('❌ Environment variable not found');
} 