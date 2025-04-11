const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    isRead: {
        type: Boolean,
        default: false
    },
    chatId: {
        type: String,
        required: false
    }
});

// Index for faster queries
messageSchema.index({ sender: 1, recipient: 1 });
messageSchema.index({ timestamp: 1 });
messageSchema.index({ chatId: 1 });

// Create a unique compound index for sender, recipient, and timestamp
// This ensures we don't save duplicate messages
messageSchema.index({ sender: 1, recipient: 1, timestamp: 1 }, { unique: true });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message; 