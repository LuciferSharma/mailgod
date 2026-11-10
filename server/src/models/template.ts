import mongoose, { Schema, Document } from 'mongoose';

export interface ITemplate extends Document {
  name: string;
  subject: string;
  html_content: string;
  preview_text: string;
  category: string;
  variables: string[];
  created_at: Date;
  updated_at: Date;
}

const templateSchema = new Schema<ITemplate>(
  {
    name: { type: String, required: true },
    subject: { type: String, required: true },
    html_content: { type: String, required: true },
    preview_text: { type: String, default: '' },
    category: { type: String, default: 'general' },
    variables: [{ type: String }],
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

export const Template = mongoose.model<ITemplate>('Template', templateSchema);
