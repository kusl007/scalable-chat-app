import dotenv from "dotenv";
dotenv.config();

import { Kafka, Producer } from "kafkajs";
import fs from "fs";
import path from "path";
import connectDB from "./db";
import Message from "../models/message.model";

const kafka = new Kafka({
  brokers: [process.env.KAFKA_HOST || ""],
  ssl: {
    ca: [fs.readFileSync(path.resolve("./ca.pem"), "utf-8")],
  },
  sasl: {
    username: process.env.KAFKA_USERNAME || "",
    password: process.env.KAFKA_PASSWORD || "",
    mechanism: "plain",
  },
});

let producer: null | Producer = null;

export async function createProducer() {
  if (producer) {
    return producer;
  }

  const _producer = kafka.producer();
  await _producer.connect();
  producer = _producer;
  return producer;
}

export async function produceMessage(message: string) {
  console.log("New message produced to kafka", message);
  const producer = await createProducer();
  await producer.send({
    messages: [{ key: `message-${Date.now()}`, value: message }],
    topic: "MESSAGES",
  });

  return true;
}

export async function startMessageConsumer() {
  console.log("Consumer is running...");
  await connectDB();

  const consumer = kafka.consumer({ groupId: "default" });
  await consumer.connect();
  await consumer.subscribe({ topic: "MESSAGES", fromBeginning: true });

  await consumer.run({
    autoCommit: true,
    eachMessage: async ({ message, pause }) => {
      if (!message.value) return;

      console.log("New message received on kafka", message.value.toString());
      try {
        // TODO: Add database query
        const newMessage = new Message({
          content: message.value,
        });

        await newMessage.save();
      } catch (err) {
        console.log("Something is wrong");
        pause();
        setTimeout(() => {
          consumer.resume([{ topic: "MESSAGES" }]);
        }, 60 * 1000);
      }
    },
  });
}

export default kafka;
