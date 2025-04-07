require('dotenv').config();
const axios = require('axios');
const schedule = require('node-schedule');
const twilio = require('twilio');

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const OUNCE_TO_TOLA = 2.667; 
const INR_TO_NPR = 1.6;
const NPR_PREMIUM = 1.1;
// Define a test phone number for manual runs
const TEST_PHONE_NUMBER = process.env.TEST_PHONE_NUMBER || process.env.RECIPIENT_PHONE_NUMBER;

async function fetchGoldPrice(currency) {
  try {
    const response = await axios.get('https://www.goldapi.io/api/XAU/' + currency, {
      headers: {
        'x-access-token': process.env.GOLDAPI_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    return response.data;
  } catch (error) {
    console.error(`Error fetching gold price in ${currency}:`, error.message);
    if (error.response) {
      console.error('API response error:', error.response.data);
    }
    throw error;
  }
}

async function displayGoldPrices(isScheduled = false) {
  try {
    console.log('='.repeat(50));
    console.log(`GOLD PRICE UPDATE - ${new Date().toLocaleString()}`);
    console.log('='.repeat(50));
    
    let audData = await fetchGoldPrice('AUD');
    
    if (!audData || typeof audData.price === 'undefined') {
      console.error('No valid price data found in AUD response:', audData);
      throw new Error('AUD price data unavailable or invalid');
    }
    
    const pricePerOunceAUD = audData.price;
    const pricePerTolaAUD = pricePerOunceAUD / OUNCE_TO_TOLA;
    
    let inrData;
    try {
      inrData = await fetchGoldPrice('INR');
      console.log('Successfully fetched gold price in INR');
      
      if (!inrData || typeof inrData.price === 'undefined') {
        console.error('No valid price data found in INR response:', inrData);
        throw new Error('INR price data unavailable or invalid');
      }
    } catch (error) {
      console.error('Failed to fetch INR price from goldapi. Cannot proceed without INR data.');
      throw new Error('INR price data unavailable');
    }
    
    const pricePerOunceINR = inrData.price;
    const pricePerOunceNPR = pricePerOunceINR * INR_TO_NPR * NPR_PREMIUM;
    const pricePerTolaNPR = pricePerOunceNPR / OUNCE_TO_TOLA;
    
    console.log('AUSTRALIA (AUD):');
    console.log(`1 Troy Ounce: AUD ${pricePerOunceAUD.toFixed(2)}`);
    console.log(`1 Tola: AUD ${pricePerTolaAUD.toFixed(2)}`);
    console.log();
    
    console.log('NEPAL (NPR):');
    console.log(`1 Troy Ounce: NPR ${pricePerOunceNPR.toFixed(2)}`);
    console.log(`1 Tola: NPR ${pricePerTolaNPR.toFixed(2)}`);
    console.log(`(Price converted from INR using rate: 1 INR = ${INR_TO_NPR} NPR, with 10% premium applied)`);
    
    console.log('='.repeat(50));

    const message = `Gold Price Update:\n\nAUSTRALIA (AUD):\n1 Troy Ounce: AUD ${pricePerOunceAUD.toFixed(2)}\n1 Tola: AUD ${pricePerTolaAUD.toFixed(2)}\n\nNEPAL (NPR):\n1 Troy Ounce: NPR ${pricePerOunceNPR.toFixed(2)}\n1 Tola: NPR ${pricePerTolaNPR.toFixed(2)}`;
    
    // Use the test number for manual runs and original number for scheduled runs
    const recipientNumber = isScheduled ? process.env.RECIPIENT_PHONE_NUMBER : TEST_PHONE_NUMBER;
    
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: recipientNumber
    });
    
    console.log(`SMS sent successfully to ${isScheduled ? 'primary' : 'test'} number.`);
  } catch (error) {
    console.error('Failed to display gold prices:', error);
  }
}

console.log('Starting gold price tracker. Updates at 10 AM and 6 PM Sydney time.');
console.log('Press Ctrl+C to stop the program.');

displayGoldPrices(false);

const morningJob = schedule.scheduleJob({hour: 10, minute: 0, tz: 'Australia/Sydney'}, () => displayGoldPrices(true));

const eveningJob = schedule.scheduleJob({hour: 18, minute: 0, tz: 'Australia/Sydney'}, () => displayGoldPrices(true));

process.on('SIGINT', () => {
  console.log('Stopping gold price tracker...');
  morningJob.cancel();
  eveningJob.cancel();
  process.exit(0);
});