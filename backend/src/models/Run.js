const mongoose = require("mongoose");

const coordinateSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
  },
  { _id: false }
);

const runSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    userName: { type: String, default: "Runner" },
    distance: { type: Number, required: true, min: 0 },
    duration: { type: Number, required: true, min: 0 },
    pace: { type: Number, required: true, min: 0 },
    routeCoordinates: { type: [coordinateSchema], default: [] },
    timestamp: { type: Date, default: Date.now, index: true },
    isValidated: { type: Boolean, default: true },
  },
  { versionKey: false }
);

runSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model("Run", runSchema);
