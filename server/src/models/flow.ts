import mongoose, { Schema, Document } from 'mongoose';

export interface IFlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
}

export interface IFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
}

export interface IFlow extends Document {
  name: string;
  description: string;
  status: 'draft' | 'active' | 'paused';
  trigger: {
    type: 'manual' | 'scheduled';
    config: Record<string, any>;
  };
  nodes: IFlowNode[];
  edges: IFlowEdge[];
  settings: {
    frequency_cap: number;
    exit_conditions: any[];
    exit_on_reply: boolean;
    enrollment_spread_seconds: number;
  };
  stats: {
    enrolled: number;
    completed: number;
    active: number;
  };
  created_at: Date;
  updated_at: Date;
}

const flowNodeSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    position: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
    },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const flowEdgeSchema = new Schema(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    sourceHandle: { type: String },
    targetHandle: { type: String },
    label: { type: String },
  },
  { _id: false }
);

const flowSchema = new Schema<IFlow>(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: ['draft', 'active', 'paused'],
      default: 'draft',
    },
    trigger: {
      type: {
        type: String,
        enum: ['manual', 'scheduled'],
        default: 'manual',
      },
      config: { type: Schema.Types.Mixed, default: {} },
    },
    nodes: [flowNodeSchema],
    edges: [flowEdgeSchema],
    settings: {
      frequency_cap: { type: Number, default: 1 },
      exit_conditions: [{ type: Schema.Types.Mixed }],
      exit_on_reply: { type: Boolean, default: true },
      enrollment_spread_seconds: { type: Number, default: 10 },
    },
    stats: {
      enrolled: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      active: { type: Number, default: 0 },
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

flowSchema.index({ status: 1, created_at: -1 });

export const Flow = mongoose.model<IFlow>('Flow', flowSchema);
