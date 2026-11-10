import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import mongoose from 'mongoose';
import { config } from '../server/src/config';

const subscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, default: '' },
  country: { type: String, default: '' },
  language: { type: String, default: 'en' },
  plan_tier: { type: String, default: 'free' },
  last_login: { type: Date, default: null },
  usage_count: { type: Number, default: 0 },
  paid: { type: Boolean, default: false },
  cancelled: { type: Boolean, default: false },
  signup_source: { type: String, default: 'organic' },
  tags: [{ type: String }],
  custom_attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, default: 'active' },
  engagement: {
    emails_sent: { type: Number, default: 0 },
    emails_opened: { type: Number, default: 0 },
    emails_clicked: { type: Number, default: 0 },
    last_email_at: { type: Date, default: null },
  },
  frequency: {
    emails_sent_today: { type: Number, default: 0 },
    last_email_date: { type: Date, default: null },
  },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const Subscriber = mongoose.model('Subscriber', subscriberSchema);

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: npx tsx scripts/import-subscribers.ts <path-to-csv>');
    process.exit(1);
  }

  await mongoose.connect(config.mongodbUri);
  console.log('Connected to MongoDB');

  const records: any[] = [];
  const parser = createReadStream(csvPath).pipe(
    parse({ columns: true, skip_empty_lines: true, trim: true })
  );

  for await (const record of parser) {
    if (record.email) {
      records.push({
        email: record.email.toLowerCase().trim(),
        name: record.name || '',
        country: record.country || '',
        plan_tier: record.plan_tier || record.plan || 'free',
        signup_source: record.signup_source || record.source || 'organic',
        paid: record.paid === 'true' || record.paid === '1',
        cancelled: record.cancelled === 'true' || record.cancelled === '1',
        usage_count: parseInt(record.usage_count) || 0,
        last_login: record.last_login ? new Date(record.last_login) : null,
      });
    }
  }

  console.log(`Parsed ${records.length} records from CSV`);

  let imported = 0;
  let skipped = 0;
  const batchSize = 1000;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const ops = batch.map(r => ({
      updateOne: {
        filter: { email: r.email },
        update: { $setOnInsert: r },
        upsert: true,
      },
    }));

    const result = await Subscriber.bulkWrite(ops, { ordered: false });
    imported += result.upsertedCount;
    skipped += batch.length - result.upsertedCount;

    console.log(`Batch ${Math.floor(i / batchSize) + 1}: imported ${result.upsertedCount}, skipped ${batch.length - result.upsertedCount}`);
  }

  console.log(`\nDone! Imported: ${imported}, Skipped: ${skipped}, Total: ${records.length}`);
  await mongoose.disconnect();
}

main().catch(console.error);
