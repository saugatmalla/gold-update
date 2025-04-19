import { GoogleGenAI } from "@google/genai";
import twilio from "twilio";
import dotenv from 'dotenv';
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
        What is the todays Hallmark gold and silver price in Nepal? Also, compare these prices the last days prices. https://www.ashesh.com.np/gold/ for your reference. Limit the response text to 160 characters? Use this format below for answer:
        Hallmark gold:
        Today - {price of today}
        Yesterday - {price of yesterday}
        
        Silver:
        Today - {price of today}
        Yesterday - {price of yesterday}
        `,
    ],
    config: {
      tools: [{googleSearch: {}}],
    },
  });
  console.log(response.text);
  return response.text;
}

async function displayGoldPrices() {
  try {
    const message = await getPriceWithGemini(); 

    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: process.env.RECIPIENT_PHONE_NUMBER
    });

    console.log('SMS sent successfully.');
  } catch (error) {
    console.error('Error in displaying gold prices:', error);
    throw error;
  }
}

displayGoldPrices();