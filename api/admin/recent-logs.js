/**
 * Recent Callback Logs API
 * GET /api/admin/recent-logs - Get recent M-Pesa callback logs
 */

// Store recent logs in memory (will reset on redeploy)
global.recentCallbackLogs = global.recentCallbackLogs || [];

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const logs = global.recentCallbackLogs || [];
    
    res.json({
      success: true,
      count: logs.length,
      logs: logs.slice(-20) // Last 20 logs
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Helper function to add a log entry (called from callback)
function addCallbackLog(logEntry) {
  global.recentCallbackLogs = global.recentCallbackLogs || [];
  global.recentCallbackLogs.push({
    ...logEntry,
    timestamp: new Date().toISOString()
  });
  
  // Keep only last 50 logs
  if (global.recentCallbackLogs.length > 50) {
    global.recentCallbackLogs = global.recentCallbackLogs.slice(-50);
  }
}

module.exports.addCallbackLog = addCallbackLog;
