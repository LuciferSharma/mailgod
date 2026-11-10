import mongoose, { Schema, Document } from 'mongoose';

export interface ISetting extends Document {
  key: string;
  value: any;
}

const settingSchema = new Schema<ISetting>(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed },
  },
  { timestamps: false }
);

export const Setting = mongoose.model<ISetting>('Setting', settingSchema);

export async function getSetting(key: string, defaultValue: any = null): Promise<any> {
  const setting = await Setting.findOne({ key });
  return setting ? setting.value : defaultValue;
}

export async function setSetting(key: string, value: any): Promise<void> {
  await Setting.updateOne({ key }, { key, value }, { upsert: true });
}
