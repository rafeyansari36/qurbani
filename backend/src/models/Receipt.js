import mongoose from 'mongoose';

const hissaSchema = new mongoose.Schema(
  {
    hissaNo: { type: Number, required: true }, // 1..N within this receipt
    code: { type: String, required: true }, // e.g. Q-2026-0001/1
    serialNo: { type: Number, required: true }, // per day+qurbaniType for master sheet
    naam: { type: String, required: true, trim: true },
    type: { type: String, enum: ['qurbani', 'aqeeqah'], required: true },
    aqeeqahGender: { type: String, enum: ['ladka', 'ladki', null], default: null },
    aqeeqahPart: { type: Number, default: null }, // 1 or 2 for ladka's pair
    pairId: { type: String, default: null }, // links the two halves of a ladka aqeeqah
  },
  { _id: false }
);

const receiptSchema = new mongoose.Schema(
  {
    receiptNo: { type: String, required: true, unique: true, index: true },

    naam: { type: String, required: true, trim: true }, // primary contact (family)
    address: { type: String, default: '', trim: true },
    mobile: { type: String, required: true, trim: true, index: true },

    day: { type: Number, enum: [1, 2, 3], required: true },
    qurbaniType: { type: String, enum: ['in', 'out'], required: true },

    hisse: { type: [hissaSchema], default: [] },
    totalHisse: { type: Number, required: true, min: 1 },

    amount: { type: Number, default: 0 },
    notes: { type: String, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, required: true },
    deviceInfo: {
      userAgent: String,
      ip: String,
      deviceLabel: String,
    },

    cancelled: { type: Boolean, default: false },
    cancelledAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

receiptSchema.index({ day: 1, qurbaniType: 1 });
receiptSchema.index({ createdAt: -1 });

export default mongoose.model('Receipt', receiptSchema);
