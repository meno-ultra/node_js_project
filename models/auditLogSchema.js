const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const auditLogSchema = new Schema(
  {
    actorUsername: { type: String, required: true, trim: true },
    actorRole: { type: String, required: true, trim: true },
    action: { type: String, required: true, trim: true },
    targetType: { type: String, required: true, trim: true },
    targetId: { type: String, trim: true },
    details: { type: String, trim: true },
  },
  { timestamps: true }
);

const AuditLog = mongoose.model("audit_log", auditLogSchema);

module.exports = AuditLog;
