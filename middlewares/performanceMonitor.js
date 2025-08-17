/**
 * 🚀 COMPREHENSIVE PERFORMANCE MONITORING SYSTEM
 * 
 * Real-time monitoring for 2000+ concurrent users
 * Features:
 * - System resource monitoring (CPU, Memory, Network)
 * - Database connection pool monitoring
 * - Redis performance tracking
 * - HTTP request performance
 * - Socket.IO connection monitoring
 * - Alert system for critical thresholds
 * - Performance dashboard endpoint
 */

const os = require('os');
const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      // System metrics
      system: {
        cpuUsage: 0,
        memoryUsage: {
          heapUsed: 0,
          heapTotal: 0,
          external: 0,
          rss: 0
        },
        uptime: 0,
        loadAverage: [0, 0, 0]
      },
      
      // HTTP metrics
      http: {
        totalRequests: 0,
        activeRequests: 0,
        requestsPerSecond: 0,
        averageResponseTime: 0,
        responseTimeHistory: [],
        errorRate: 0,
        statusCodes: {
          '2xx': 0,
          '3xx': 0,
          '4xx': 0,
          '5xx': 0
        }
      },
      
      // Database metrics
      database: {
        connections: {
          total: 0,
          available: 0,
          current: 0
        },
        queries: {
          total: 0,
          slow: 0,
          failed: 0,
          averageTime: 0
        }
      },
      
      // Cache metrics
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0,
        errors: 0,
        totalRequests: 0
      },
      
      // Socket.IO metrics
      socket: {
        connectedUsers: 0,
        maxConcurrentUsers: 0,
        totalConnections: 0,
        totalDisconnections: 0,
        messagesPerSecond: 0
      },
      
      // Performance alerts
      alerts: {
        highCpuUsage: false,
        highMemoryUsage: false,
        slowResponseTime: false,
        highErrorRate: false,
        databaseConnectionsHigh: false
      }
    };
    
    this.thresholds = {
      cpu: 70,           // CPU usage percentage
      memory: 80,        // Memory usage percentage  
      responseTime: 1000, // Response time in ms
      errorRate: 5,      // Error rate percentage
      dbConnections: 25   // Database connections (out of 30)
    };
    
    this.requestTimes = [];
    this.startTime = Date.now();
    this.lastRequestCount = 0;
    
    this.initializeMonitoring();
  }
  
  initializeMonitoring() {
    // Start system monitoring
    this.startSystemMonitoring();
    
    // Start performance logging
    this.startPerformanceLogging();
    
    console.log('🚀 Performance Monitor initialized for 2000+ users');
  }
  
  startSystemMonitoring() {
    setInterval(() => {
      this.collectSystemMetrics();
      this.checkAlerts();
    }, 10000); // Every 10 seconds
  }
  
  startPerformanceLogging() {
    setInterval(() => {
      this.logPerformanceMetrics();
      this.calculateRates();
    }, 30000); // Every 30 seconds
  }
  
  collectSystemMetrics() {
    // CPU metrics
    const cpus = os.cpus();
    const cpuUsage = os.loadavg()[0] / cpus.length * 100;
    this.metrics.system.cpuUsage = Math.min(cpuUsage, 100);
    this.metrics.system.loadAverage = os.loadavg();
    
    // Memory metrics
    const memUsage = process.memoryUsage();
    this.metrics.system.memoryUsage = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024), // MB
      rss: Math.round(memUsage.rss / 1024 / 1024) // MB
    };
    
    // System uptime
    this.metrics.system.uptime = Math.round(process.uptime());
    
    // Database connections
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      this.metrics.database.connections.current = mongoose.connections.length;
      // Note: MongoDB driver doesn't expose pool stats directly
      // This is an approximation
      this.metrics.database.connections.total = 30; // Our max pool size
    }
    
    // Calculate HTTP metrics
    this.calculateHttpMetrics();
  }
  
  calculateHttpMetrics() {
    // Calculate average response time
    if (this.requestTimes.length > 0) {
      const sum = this.requestTimes.reduce((a, b) => a + b, 0);
      this.metrics.http.averageResponseTime = Math.round(sum / this.requestTimes.length);
      
      // Keep only last 100 response times
      if (this.requestTimes.length > 100) {
        this.requestTimes = this.requestTimes.slice(-100);
      }
    }
    
    // Calculate error rate
    const totalResponses = Object.values(this.metrics.http.statusCodes).reduce((a, b) => a + b, 0);
    if (totalResponses > 0) {
      const errors = this.metrics.http.statusCodes['4xx'] + this.metrics.http.statusCodes['5xx'];
      this.metrics.http.errorRate = Math.round((errors / totalResponses) * 100);
    }
  }
  
  calculateRates() {
    // Calculate requests per second
    const currentTime = Date.now();
    const timeDiff = (currentTime - this.startTime) / 1000;
    const requestDiff = this.metrics.http.totalRequests - this.lastRequestCount;
    
    if (timeDiff > 0) {
      this.metrics.http.requestsPerSecond = Math.round(requestDiff / Math.min(timeDiff, 30));
    }
    
    this.lastRequestCount = this.metrics.http.totalRequests;
    this.startTime = currentTime;
  }
  
  checkAlerts() {
    const alerts = this.metrics.alerts;
    
    // CPU Alert
    alerts.highCpuUsage = this.metrics.system.cpuUsage > this.thresholds.cpu;
    
    // Memory Alert
    const memoryPercent = (this.metrics.system.memoryUsage.heapUsed / this.metrics.system.memoryUsage.heapTotal) * 100;
    alerts.highMemoryUsage = memoryPercent > this.thresholds.memory;
    
    // Response Time Alert
    alerts.slowResponseTime = this.metrics.http.averageResponseTime > this.thresholds.responseTime;
    
    // Error Rate Alert
    alerts.highErrorRate = this.metrics.http.errorRate > this.thresholds.errorRate;
    
    // Database Connections Alert
    alerts.databaseConnectionsHigh = this.metrics.database.connections.current > this.thresholds.dbConnections;
    
    // Log critical alerts
    this.logAlerts();
  }
  
  logAlerts() {
    const alerts = this.metrics.alerts;
    
    if (alerts.highCpuUsage) {
      logger.error(`🚨 HIGH CPU USAGE: ${this.metrics.system.cpuUsage.toFixed(2)}%`);
    }
    
    if (alerts.highMemoryUsage) {
      logger.error(`🚨 HIGH MEMORY USAGE: ${this.metrics.system.memoryUsage.heapUsed}MB`);
    }
    
    if (alerts.slowResponseTime) {
      logger.error(`🚨 SLOW RESPONSE TIME: ${this.metrics.http.averageResponseTime}ms`);
    }
    
    if (alerts.highErrorRate) {
      logger.error(`🚨 HIGH ERROR RATE: ${this.metrics.http.errorRate}%`);
    }
    
    if (alerts.databaseConnectionsHigh) {
      logger.error(`🚨 HIGH DB CONNECTIONS: ${this.metrics.database.connections.current}/${this.metrics.database.connections.total}`);
    }
  }
  
  logPerformanceMetrics() {
    const perf = {
      timestamp: new Date().toISOString(),
      system: {
        cpu: `${this.metrics.system.cpuUsage.toFixed(2)}%`,
        memory: `${this.metrics.system.memoryUsage.heapUsed}MB`,
        uptime: `${Math.floor(this.metrics.system.uptime / 60)}min`
      },
      http: {
        rps: this.metrics.http.requestsPerSecond,
        avgResponse: `${this.metrics.http.averageResponseTime}ms`,
        active: this.metrics.http.activeRequests,
        errorRate: `${this.metrics.http.errorRate}%`
      },
      database: {
        connections: `${this.metrics.database.connections.current}/${this.metrics.database.connections.total}`
      },
      socket: {
        connected: this.metrics.socket.connectedUsers,
        peak: this.metrics.socket.maxConcurrentUsers
      }
    };
    
    console.log('📊 Performance Metrics:', perf);
    logger.system(`Performance: CPU ${perf.system.cpu}, Memory ${perf.system.memory}, RPS ${perf.http.rps}, Response ${perf.http.avgResponse}, Users ${perf.socket.connected}`);
  }
  
  // Middleware to track HTTP requests
  trackRequest() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Increment active requests
      this.metrics.http.activeRequests++;
      this.metrics.http.totalRequests++;
      
      // Track response
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        
        // Record response time
        this.requestTimes.push(duration);
        this.metrics.http.responseTimeHistory.push({
          timestamp: Date.now(),
          duration: duration,
          path: req.path,
          method: req.method
        });
        
        // Keep only last 50 response history items
        if (this.metrics.http.responseTimeHistory.length > 50) {
          this.metrics.http.responseTimeHistory.shift();
        }
        
        // Track status codes
        const statusCode = res.statusCode;
        if (statusCode >= 200 && statusCode < 300) {
          this.metrics.http.statusCodes['2xx']++;
        } else if (statusCode >= 300 && statusCode < 400) {
          this.metrics.http.statusCodes['3xx']++;
        } else if (statusCode >= 400 && statusCode < 500) {
          this.metrics.http.statusCodes['4xx']++;
        } else if (statusCode >= 500) {
          this.metrics.http.statusCodes['5xx']++;
        }
        
        // Decrement active requests
        this.metrics.http.activeRequests--;
        
        // Log slow requests
        if (duration > 2000) { // 2 seconds
          logger.error(`🐌 VERY SLOW REQUEST: ${req.method} ${req.path} - ${duration}ms`);
        } else if (duration > 1000) { // 1 second
          console.warn(`⚠️ SLOW REQUEST: ${req.method} ${req.path} - ${duration}ms`);
        }
      });
      
      next();
    };
  }
  
  // Update Socket.IO metrics
  updateSocketMetrics(connectedUsers) {
    this.metrics.socket.connectedUsers = connectedUsers;
    this.metrics.socket.maxConcurrentUsers = Math.max(
      this.metrics.socket.maxConcurrentUsers,
      connectedUsers
    );
  }
  
  // Update cache metrics (called by cache middleware)
  updateCacheMetrics(hits, misses, errors, totalRequests) {
    this.metrics.cache.hits = hits;
    this.metrics.cache.misses = misses;
    this.metrics.cache.errors = errors;
    this.metrics.cache.totalRequests = totalRequests;
    this.metrics.cache.hitRate = totalRequests > 0 ? 
      Math.round((hits / totalRequests) * 100) : 0;
  }
  
  // Get current metrics (for dashboard endpoint)
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: new Date().toISOString(),
      capacity: this.getCapacityAssessment()
    };
  }
  
  // Assess current capacity
  getCapacityAssessment() {
    const cpuScore = Math.max(0, 100 - this.metrics.system.cpuUsage);
    const memoryPercent = (this.metrics.system.memoryUsage.heapUsed / this.metrics.system.memoryUsage.heapTotal) * 100;
    const memoryScore = Math.max(0, 100 - memoryPercent);
    const responseScore = Math.max(0, 100 - (this.metrics.http.averageResponseTime / 10));
    const errorScore = Math.max(0, 100 - (this.metrics.http.errorRate * 5));
    
    const overallScore = Math.round((cpuScore + memoryScore + responseScore + errorScore) / 4);
    
    let status = 'EXCELLENT';
    let estimatedCapacity = '2000+';
    
    if (overallScore < 50) {
      status = 'CRITICAL';
      estimatedCapacity = '500-1000';
    } else if (overallScore < 70) {
      status = 'WARNING';
      estimatedCapacity = '1000-1500';
    } else if (overallScore < 85) {
      status = 'GOOD';
      estimatedCapacity = '1500-2000';
    }
    
    return {
      overallScore,
      status,
      estimatedCapacity,
      currentLoad: this.metrics.socket.connectedUsers,
      recommendations: this.getRecommendations()
    };
  }
  
  getRecommendations() {
    const recommendations = [];
    
    if (this.metrics.alerts.highCpuUsage) {
      recommendations.push('Consider horizontal scaling or optimizing CPU-intensive operations');
    }
    
    if (this.metrics.alerts.highMemoryUsage) {
      recommendations.push('Monitor memory leaks and consider increasing server memory');
    }
    
    if (this.metrics.alerts.slowResponseTime) {
      recommendations.push('Optimize database queries and enable more caching');
    }
    
    if (this.metrics.alerts.highErrorRate) {
      recommendations.push('Investigate and fix application errors');
    }
    
    if (this.metrics.socket.connectedUsers > 1500) {
      recommendations.push('Consider load balancing for Socket.IO connections');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('System performance is optimal');
    }
    
    return recommendations;
  }
  
  // Reset metrics (for testing)
  resetMetrics() {
    this.metrics.http.totalRequests = 0;
    this.metrics.http.statusCodes = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    this.requestTimes = [];
    console.log('📊 Performance metrics reset');
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

module.exports = {
  performanceMonitor,
  PerformanceMonitor
};
