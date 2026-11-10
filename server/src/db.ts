import mongoose from 'mongoose';
import { config } from './config';

export async function connectDB(): Promise<void> {
  await mongoose.connect(config.mongodbUri);
  console.log('MongoDB connected:', config.mongodbUri);
}
