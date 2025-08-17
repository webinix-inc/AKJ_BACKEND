module.exports = {
  apps: [{
    name: 'akj-academy-backend',
    script: 'server.js',
    instances: 'max', // Use all CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 4442
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 4442
    },
    // 🚀 Production optimizations
    max_memory_restart: '1G',
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    
    // 🚀 Logging
    log_file: './LogFile/combined.log',
    out_file: './LogFile/out.log',
    error_file: './LogFile/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // 🚀 Advanced settings
    watch: false, // Don't watch in production
    ignore_watch: ['node_modules', 'LogFile', 'uploads'],
    
    // 🚀 Health monitoring
    health_check_grace_period: 3000,
    
    // 🚀 Environment variables
    env_file: '.env'
  }]
};
