require('dotenv').config();
const axios = require('axios');
const twilio = require('twilio');

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const OUNCE_TO_TOLA = 2.667;
const INR_TO_NPR = 1.6;
const NPR_PREMIUM = 1.1;

const RECIPIENT_PHONE_NUMBER = process.env.RECIPIENT_PHONE_NUMBER;

async function fetchGoldPrice(currency) {
  try {
    const response = await axios.get(
      'https://www.goldapi.io/api/XAU/' + currency,
      {
        headers: {
          'x-access-token': process.env.GOLDAPI_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error(`Error fetching gold price in ${currency}:`, error.message);
    if (error.response) {
      console.error('API response error:', error.response.data);
    }
    throw error;
  }
}

async function displayGoldPrices() {
  try {
    console.log('='.repeat(50));
    console.log(`GOLD PRICE UPDATE - ${new Date().toLocaleString()}`);
    console.log('='.repeat(50));

    let audData = await fetchGoldPrice('AUD');
    if (!audData || typeof audData.price === 'undefined') {
      console.error('No valid AUD price data:', audData);
      throw new Error('AUD price data unavailable or invalid');
    }
    const pricePerOunceAUD = audData.price;
    const pricePerTolaAUD = pricePerOunceAUD / OUNCE_TO_TOLA;

    let inrData;
    try {
      inrData = await fetchGoldPrice('INR');
      console.log('Successfully fetched gold price in INR');
      if (!inrData || typeof inrData.price === 'undefined') {
        console.error('No valid INR price data:', inrData);
        throw new Error('INR price data unavailable or invalid');
      }
    } catch (error) {
      console.error('Failed to fetch INR data');
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
    console.log('='.repeat(50));

    const message = `Gold Price Update:\n\nAUSTRALIA (AUD):\n1 Troy Ounce: AUD ${pricePerOunceAUD.toFixed(2)}\n1 Tola: AUD ${pricePerTolaAUD.toFixed(2)}\n\nNEPAL (NPR):\n1 Troy Ounce: NPR ${pricePerOunceNPR.toFixed(2)}\n1 Tola: NPR ${pricePerTolaNPR.toFixed(2)}`;

    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: RECIPIENT_PHONE_NUMBER
    });

    console.log('SMS sent successfully.');
  } catch (error) {
    console.error('Error in displaying gold prices:', error);
    throw error;
  }
}

exports.handler = async (event, context) => {
  console.log("Triggered Netlify Scheduled Function.");
  await displayGoldPrices();
  return {
    statusCode: 200,
    body: "Gold Price SMS sent successfully."
  };
};

