import { GoogleGenAI } from "@google/genai";
import twilio from "twilio";
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });


const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function getPriceWithGemini() {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      `
          Use this link: https://www.hamropatro.com/gold. What is the hallmark gold price per tola and silver price per tola today? Answer in this JSON schema: 
          Price = {'gold': number, 'silver': number}
          Return: Price 
        `,
    ],
    config: {
      tools: [{ googleSearch: {} }],
    },
  });
  return response.text;
}

function parseJsonMessage(_message) {
  let goldPrice, silverPrice;
  try {
    // remove string ```json from the start and end of the message
    const message = _message.replace(/```json/g, '').replace(/```/g, '').trim();

    let priceData;
    try {
      priceData = JSON.parse(message);
    } catch (e) {
      throw new Error('Message is not valid JSON');
    }

    if (!priceData || typeof priceData !== 'object') {
      throw new Error('Invalid JSON format');
    }
    goldPrice = priceData.gold;
    silverPrice = priceData.silver;
    
    return { goldPrice, silverPrice };

  } catch (jsonError) {
    console.error('Error parsing JSON:', jsonError);
    
  }
}

async function updateGoldSilverPrices({ goldPrice, silverPrice }) {
  const csvPath = path.resolve('./data.csv');
  let lastGold = null, lastSilver = null;

  try {
    if (
      goldPrice === undefined ||
      silverPrice === undefined ||
      isNaN(parseInt(goldPrice, 10)) ||
      isNaN(parseInt(silverPrice, 10))
    ) {
      throw new Error('Invalid gold or silver price input.');
    }

    if (!fs.existsSync(csvPath)) {
      try {
        fs.writeFileSync(csvPath, 'date,gold,silver\n', 'utf8');
      } catch (writeErr) {
        console.error('Error creating CSV file:', writeErr);
        throw writeErr;
      }
    }

    let data;
    try {
      data = fs.readFileSync(csvPath, 'utf8').trim();
    } catch (readErr) {
      console.error('Error reading CSV file:', readErr);
      throw readErr;
    }

    const rows = data.split('\n');
    if (rows.length > 1) {
      const lastRow = rows[rows.length - 1].split(',');
      if (
        lastRow.length >= 3 &&
        !isNaN(parseInt(lastRow[1], 10)) &&
        !isNaN(parseInt(lastRow[2], 10))
      ) {
        lastGold = parseInt(lastRow[1], 10);
        lastSilver = parseInt(lastRow[2], 10);
      }
    }

    const newGold = parseInt(goldPrice, 10);
    const newSilver = parseInt(silverPrice, 10);

    const goldDiff = lastGold !== null ? newGold - lastGold : null;
    const silverDiff = lastSilver !== null ? newSilver - lastSilver : null;

    const today = new Date().toISOString().split('T')[0];
    const newRow = `${today},${newGold},${newSilver}\n`;
    try {
      fs.appendFileSync(csvPath, newRow, 'utf8');
    } catch (appendErr) {
      console.error('Error appending to CSV file:', appendErr);
      throw appendErr;
    }

    return { goldDiff, silverDiff };
  } catch (err) {
    console.error('Error in updateGoldSilverPrices:', err);
    return { goldDiff: null, silverDiff: null, error: err.message };
  }
}

async function displayGoldPrices() {
  try {
    const message = await getPriceWithGemini();

    const jsonMessage = parseJsonMessage(message);

    if (!jsonMessage) {
      console.error('Failed to parse JSON message.');
      return;
    }

    const { goldPrice, silverPrice } = jsonMessage;

    const { goldDiff, silverDiff, error } = await updateGoldSilverPrices({ goldPrice, silverPrice });

    if (error) {
      console.error('Failed to update prices:', error);
    }

    const smsMessage = [
      `Gold Price: ${goldPrice}`,
      `Silver Price: ${silverPrice}`,
      `Gold Diff: ${goldDiff}`,
      `Silver Diff: ${silverDiff}`,
      'Reply STOP to unsubscribe.'
    ].join('\n');

    await twilioClient.messages.create({
      body: smsMessage,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: process.env.RECIPIENT_PHONE_NUMBER
    });

  } catch (error) {
    console.error('Error in displaying gold prices:', error);
    throw error;
  }
}

export default async (event, context) => {
  console.log("Triggered Netlify Scheduled Function.");
  await displayGoldPrices();
  return {
    statusCode: 200,
    body: "Gold Price SMS sent successfully."
  };
};