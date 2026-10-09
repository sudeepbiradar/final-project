/**
 * Reproducible NLP & ML Classifier Optimization Benchmark Suite
 * Evaluates: Speed (throughput & latency), Memory (heap allocations), and Quality (accuracy & correctness).
 */

const { processEmailNLP } = require('../services/nlpEngine');
const { classifyByKeywords } = require('../services/classifier');
const performance = require('perf_hooks').performance;

// 1. Synthetic dataset generator (1,000 realistic email test samples)
const CATEGORIES = [
  'College / Student', 'Finance', 'Security', 'Personal', 'Spam', 'Primary', 'Updates', 'Promotions'
];

const SAMPLE_TEMPLATES = {
  'College / Student': [
    { subject: "Semester Examination Timetable Announced", body: "The university examination office has released the final timetable for the end semester examinations. Students must collect their hall tickets before Friday.", expected: "College / Student" },
    { subject: "Assignment 3 Submission Deadline", body: "Please note that the homework assignment for Computer Science CS101 is due next Monday. Submit via student portal.", expected: "College / Student" },
    { subject: "Tuition Fee Payment Notice", body: "Your registration for the next semester requires payment of tuition fees. Check academic portal for course registration.", expected: "College / Student" }
  ],
  'Finance': [
    { subject: "Your Bank Account Statement is Ready", body: "Your monthly bank statement for account ending in 4092 is ready. A deposit of $1,500 was credited. Your current balance is available online.", expected: "Finance" },
    { subject: "Credit Card Bill Due Date Reminder", body: "Your total amount due on credit card bill is $342.50. Payment due date is October 15. Please pay your billing statement to avoid penalties.", expected: "Finance" },
    { subject: "Payment Receipt for Invoice #84920", body: "We received your tax invoice payment of Rs. 12,000 via wire transfer. Thank you for your business transaction.", expected: "Finance" }
  ],
  'Security': [
    { subject: "Security Alert: New Login Detected", body: "A new sign-in was detected on your account from Chrome on Linux. If this was not you, reset your password and secure your account immediately with two-factor authentication (2FA).", expected: "Security" },
    { subject: "Your Verification Code (OTP)", body: "Your one-time identity verification code is 849201. Do not share this OTP with anyone. It expires in 10 minutes.", expected: "Security" },
    { subject: "Suspicious Activity Detected", body: "We noticed unauthorized access attempts on your account. Account recovery steps are required.", expected: "Security" }
  ],
  'Personal': [
    { subject: "Dinner this Sunday evening?", body: "Hey! Are you free for dinner this Sunday evening with family and friends? Let us catch up over weekend.", expected: "Personal" },
    { subject: "Happy Birthday! Celebration photos attached", body: "Happy birthday! Hope you had a wonderful celebration. Here are the wedding and party photos from last weekend.", expected: "Personal" },
    { subject: "Weekend Get-together", body: "Hi buddy, planning a dinner get together this Saturday night. Let me know if you can make it!", expected: "Personal" }
  ],
  'Spam': [
    { subject: "URGENT: You won $1,000,000 Lottery Jackpot!", body: "Congratulations winner! You won the grand prize jackpot! Claim your free money cash reward now. Risk-free lottery winnings!", expected: "Spam" },
    { subject: "Guaranteed Income - Bitcoin Giveaway Claim Now", body: "Exclusive deal! Claim your free bitcoin money jackpot. 100% free wire transfer to your account instantly.", expected: "Spam" }
  ],
  'Primary': [
    { subject: "Q4 Project Roadmap & Team Sync", body: "Team, let us meet tomorrow for our client proposal review and project deliverable agreement meeting. Please review the attached contract.", expected: "Primary" },
    { subject: "Client Partnership Proposal Review", body: "Dear Manager, attached is the revised client quotation and project proposal for your approval before deadline.", expected: "Primary" }
  ]
};

function generateDataset(count = 1000) {
  const dataset = [];
  const keys = Object.keys(SAMPLE_TEMPLATES);
  for (let i = 0; i < count; i++) {
    const cat = keys[i % keys.length];
    const templates = SAMPLE_TEMPLATES[cat];
    const template = templates[i % templates.length];
    dataset.push({
      id: i,
      subject: `${template.subject} [Sample #${i}]`,
      body: `${template.body} Additional body text describing email details for test index ${i}. Sender reference test.`,
      sender: `user_${i}@${cat.toLowerCase().replace(/[^a-z]/g, '')}.com`,
      expectedCategory: template.expected
    });
  }
  return dataset;
}

function runBenchmark() {
  const dataset = generateDataset(1000);
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  const startMem = process.memoryUsage();
  const startTime = performance.now();
  
  const latencies = [];
  let correctCount = 0;
  const categoryCounts = {};

  for (let i = 0; i < dataset.length; i++) {
    const item = dataset[i];
    const itemStart = performance.now();

    // Run primary NLP pipeline
    const nlpResult = processEmailNLP(item.subject, item.body, [], false, item.sender);

    const itemEnd = performance.now();
    latencies.push(itemEnd - itemStart);

    // Track accuracy
    if (nlpResult.category === item.expectedCategory) {
      correctCount++;
    }
    categoryCounts[nlpResult.category] = (categoryCounts[nlpResult.category] || 0) + 1;
  }

  const endTime = performance.now();
  const endMem = process.memoryUsage();

  const totalTimeMs = endTime - startTime;
  const throughput = (dataset.length / (totalTimeMs / 1000)).toFixed(2);
  
  // Latency metrics
  latencies.sort((a, b) => a - b);
  const meanLatency = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(3);
  const p50 = latencies[Math.floor(latencies.length * 0.50)].toFixed(3);
  const p95 = latencies[Math.floor(latencies.length * 0.95)].toFixed(3);
  const p99 = latencies[Math.floor(latencies.length * 0.99)].toFixed(3);

  // Memory metrics
  const heapUsedStartMB = (startMem.heapUsed / 1024 / 1024).toFixed(2);
  const heapUsedEndMB = (endMem.heapUsed / 1024 / 1024).toFixed(2);
  const heapDeltaMB = ((endMem.heapUsed - startMem.heapUsed) / 1024 / 1024).toFixed(2);
  const rssMB = (endMem.rss / 1024 / 1024).toFixed(2);

  const accuracy = ((correctCount / dataset.length) * 100).toFixed(2);

  const results = {
    datasetSize: dataset.length,
    nlpEngine: {
      totalTimeMs: Math.round(totalTimeMs),
      throughputEmailsPerSec: parseFloat(throughput),
      latencyMs: {
        mean: parseFloat(meanLatency),
        p50: parseFloat(p50),
        p95: parseFloat(p95),
        p99: parseFloat(p99)
      },
      memoryMB: {
        heapStart: parseFloat(heapUsedStartMB),
        heapEnd: parseFloat(heapUsedEndMB),
        heapDelta: parseFloat(heapDeltaMB),
        rss: parseFloat(rssMB)
      },
      quality: {
        correct: correctCount,
        total: dataset.length,
        accuracyPct: parseFloat(accuracy),
        categoryBreakdown: categoryCounts
      }
    }
  };

  // Benchmark classifyByKeywords from classifier.js
  if (global.gc) global.gc();
  const kwStartMem = process.memoryUsage();
  const kwStartTime = performance.now();
  const kwLatencies = [];
  let kwCorrect = 0;

  for (let i = 0; i < dataset.length; i++) {
    const item = dataset[i];
    const t0 = performance.now();
    const cat = classifyByKeywords(item.subject, item.body, item.sender);
    const t1 = performance.now();
    kwLatencies.push(t1 - t0);
    if (cat === item.expectedCategory || (item.expectedCategory === 'College / Student' && cat === 'College / Student')) {
      kwCorrect++;
    }
  }
  const kwEndTime = performance.now();
  const kwEndMem = process.memoryUsage();

  kwLatencies.sort((a, b) => a - b);
  const kwTotalTime = kwEndTime - kwStartTime;
  results.classifierKeywords = {
    totalTimeMs: Math.round(kwTotalTime),
    throughputEmailsPerSec: parseFloat((dataset.length / (kwTotalTime / 1000)).toFixed(2)),
    latencyMs: {
      mean: parseFloat((kwLatencies.reduce((a, b) => a + b, 0) / kwLatencies.length).toFixed(3)),
      p50: parseFloat(kwLatencies[Math.floor(kwLatencies.length * 0.50)].toFixed(3)),
      p95: parseFloat(kwLatencies[Math.floor(kwLatencies.length * 0.95)].toFixed(3)),
      p99: parseFloat(kwLatencies[Math.floor(kwLatencies.length * 0.99)].toFixed(3))
    },
    memoryMB: {
      heapDelta: parseFloat(((kwEndMem.heapUsed - kwStartMem.heapUsed) / 1024 / 1024).toFixed(2))
    },
    quality: {
      correct: kwCorrect,
      total: dataset.length,
      accuracyPct: parseFloat(((kwCorrect / dataset.length) * 100).toFixed(2))
    }
  };

  // Benchmark processEmailNLPBatch from nlpEngine.js
  const { processEmailNLPBatch } = require('../services/nlpEngine');
  if (global.gc) global.gc();
  const batchStartMem = process.memoryUsage();
  const batchStartTime = performance.now();
  const batchResults = processEmailNLPBatch(dataset);
  const batchEndTime = performance.now();
  const batchEndMem = process.memoryUsage();

  let batchCorrect = 0;
  for (let i = 0; i < dataset.length; i++) {
    if (batchResults[i].category === dataset[i].expectedCategory) {
      batchCorrect++;
    }
  }

  const batchTotalTime = batchEndTime - batchStartTime;
  results.nlpEngineBatch = {
    totalTimeMs: Math.round(batchTotalTime),
    throughputEmailsPerSec: parseFloat((dataset.length / (batchTotalTime / 1000)).toFixed(2)),
    perEmailLatencyMs: parseFloat((batchTotalTime / dataset.length).toFixed(3)),
    memoryMB: {
      heapDelta: parseFloat(((batchEndMem.heapUsed - batchStartMem.heapUsed) / 1024 / 1024).toFixed(2))
    },
    quality: {
      correct: batchCorrect,
      total: dataset.length,
      accuracyPct: parseFloat(((batchCorrect / dataset.length) * 100).toFixed(2))
    }
  };

  console.log(JSON.stringify(results, null, 2));
  return results;
}

runBenchmark();
