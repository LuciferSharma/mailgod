import mongoose, { Schema } from 'mongoose';

/**
 * A shared, cross-instance counter for the global send rate limit. One document
 * per fixed time window (id = `global:<hourEpoch>`). Incremented atomically by
 * every instance so the hourly cap holds no matter how many app instances run
 * (the previous in-memory counter reset on every deploy and was per-process).
 *
 * Old windows are reaped automatically by the TTL index on `expireAt`.
 */
export interface IRateWindow {
  _id: string;
  count: number;
  expireAt: Date;
}

const rateWindowSchema = new Schema<IRateWindow>(
  {
    _id: { type: String, required: true },
    count: { type: Number, default: 0 },
    expireAt: { type: Date, required: true },
  },
  { versionKey: false },
);

// TTL: Mongo deletes the doc once `expireAt` passes.
rateWindowSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export const RateWindow = mongoose.model<IRateWindow>('RateWindow', rateWindowSchema);
