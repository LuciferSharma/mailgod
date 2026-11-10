import mongoose, { Schema, Document } from 'mongoose';

export type BookingStatus = 'ACCEPTED' | 'CANCELLED' | 'RESCHEDULED' | 'PENDING';

export interface IBooking extends Document {
  cal_booking_id: string;
  event_title: string;
  trigger_event: string;
  subscriber_id: mongoose.Types.ObjectId | null;
  attendee_email: string;
  attendee_name: string;
  start_time: Date;
  end_time: Date;
  status: BookingStatus;
  meeting_url: string | null;
  raw_payload: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

const bookingSchema = new Schema<IBooking>(
  {
    cal_booking_id: { type: String, required: true, index: true },
    event_title: { type: String, default: 'Meeting' },
    trigger_event: { type: String, default: 'BOOKING_CREATED' },
    subscriber_id: { type: Schema.Types.ObjectId, ref: 'Subscriber', default: null, index: true },
    attendee_email: { type: String, required: true, index: true },
    attendee_name: { type: String, default: '' },
    start_time: { type: Date, required: true },
    end_time: { type: Date, required: true },
    status: { type: String, enum: ['ACCEPTED', 'CANCELLED', 'RESCHEDULED', 'PENDING'], default: 'ACCEPTED' },
    meeting_url: { type: String, default: null },
    raw_payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

bookingSchema.index({ start_time: -1 });

export const Booking = mongoose.model<IBooking>('Booking', bookingSchema);
