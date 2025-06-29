import { GoogleGenAI } from "@google/genai";
import { neon } from "@neondatabase/serverless";
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD } = process.env;

const sql = neon(`postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}/${PGDATABASE}?sslmode=require`);

async function getPriceWithGemini() {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      `Use this link: https://www.hamropatro.com/gold. What is the hallmark gold price per tola and silver price per tola today? Answer in this JSON schema: Price = {'gold': number, 'silver': number} Return: Price`,
    ],
    config: { tools: [{ googleSearch: {} }] },
  });
  return response.text;
}

function parseJsonMessage(_message) {
  try {
    let cleaned = _message.replace(/^[^{]*=\s*/, '').trim();

    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found');
    cleaned = match[0];

    cleaned = cleaned.replace(/'/g, '"');

    const data = JSON.parse(cleaned);
    if (typeof data.gold !== 'number' || typeof data.silver !== 'number') {
      throw new Error('Schema mismatch');
    }
    return { goldPrice: data.gold, silverPrice: data.silver };
  } catch (err) {
    console.error('Failed to parse JSON:', err, '\nRaw message:', _message);
    return null;
  }
}

async function updateGoldSilverPrices({ goldPrice, silverPrice }) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const goldInt = Math.round(goldPrice);
  const silverInt = Math.round(silverPrice);

  // Fetch yesterday's prices BEFORE inserting today's
  const prevRes = await sql`SELECT gold, silver FROM daily_prices WHERE price_date = ${yesterday}`;
  const prev = prevRes[0] || {};

  console.log(`Yesterday's prices: gold=${prev.gold}, silver=${prev.silver}`);
  console.log(`Today's prices: gold=${goldInt}, silver=${silverInt}`);

  await sql`
    INSERT INTO daily_prices (price_date, gold, silver)
    VALUES (${today}, ${goldInt}, ${silverInt})
    ON CONFLICT (price_date)
    DO UPDATE SET gold = EXCLUDED.gold, silver = EXCLUDED.silver
  `;

  const goldDiff = prev.gold != null ? goldInt - prev.gold : null;
  const silverDiff = prev.silver != null ? silverInt - prev.silver : null;
  return { goldDiff, silverDiff };
}

async function displayGoldPrices() {
  try {
    let message, parsed;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      message = await getPriceWithGemini();
      console.log("Gemini raw response:", message);
      parsed = parseJsonMessage(message);
      if (parsed) break;
      attempts++;
      if (attempts < maxAttempts) {
        console.warn(`Parse attempt ${attempts} failed, retrying...`);
      }
    }

    if (!parsed) {
      console.error(`Failed to parse Gemini response after ${maxAttempts} attempts.`);
      return;
    }

    const { goldPrice, silverPrice } = parsed;
    console.log("Parsed prices:", goldPrice, silverPrice);

    const { goldDiff, silverDiff } = await updateGoldSilverPrices({ goldPrice, silverPrice });
    console.log("Diffs:", goldDiff, silverDiff);

    const smsBody = [
      `Gold Price: ${goldPrice}`,
      `Silver Price: ${silverPrice}`,
      `Gold Diff: ${goldDiff}`,
      `Silver Diff: ${silverDiff}`,
      `Reply STOP to unsubscribe.`
    ].join('\n');

    const recipients = (process.env.RECIPIENT_PHONE_NUMBER || "")
      .split(",")
      .map(num => num.trim())
      .filter(Boolean);

    console.log("Recipients:", recipients);

    for (const to of recipients) {
      await twilioClient.messages.create({
        body: smsBody,
        from: process.env.TWILIO_PHONE_NUMBER,
        to
      });
      console.log('SMS sent to:', to);
    }
  } catch (err) {
    console.error('Error in displayGoldPrices:', err);
    throw err;
  }
}

export default async function handler(event, context) {
  console.log('Netlify function triggered at', new Date().toISOString());
  await displayGoldPrices();
  return new Response("Gold & Silver price SMS sent successfully.", {
    status: 200,
    headers: { "Content-Type": "text/plain" }
  });
}
