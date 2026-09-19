import { MongoClient } from "mongodb";

const globalForMongo = globalThis as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
};

export async function getDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. Add it to .env.local.");

  let clientPromise = globalForMongo.mongoClientPromise;
  if (!clientPromise) {
    clientPromise = new MongoClient(uri).connect();
    globalForMongo.mongoClientPromise = clientPromise;
  }

  try {
    const client = await clientPromise;
    return client.db(process.env.MONGODB_DB ?? "pairly");
  } catch (error) {
    if (globalForMongo.mongoClientPromise === clientPromise) globalForMongo.mongoClientPromise = undefined;
    throw error;
  }
}