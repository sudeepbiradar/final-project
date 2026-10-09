const { processEmailNLP } = require('../services/nlpEngine');

const testCases = [
  {
    name: "College / Student",
    subject: "Semester Examination Timetable",
    body: "The university has released the timetable for the upcoming semester examinations."
  },
  {
    name: "Finance",
    subject: "Your bank transaction was successful",
    body: "A transaction of ₹5,000 was completed successfully."
  },
  {
    name: "Security",
    subject: "New login detected",
    body: "A new device signed into your account. If this was not you, secure your account immediately."
  },
  {
    name: "Personal",
    subject: "Dinner this Sunday?",
    body: "Are you free for dinner this Sunday evening?"
  },
  {
    name: "Primary",
    subject: "Welcome to our community",
    body: "Thank you for joining our community."
  }
];

console.log("=== Testing Controlled Category NLP Intelligence ===");
testCases.forEach((t, i) => {
  const result = processEmailNLP(t.subject, t.body);
  console.log(`\n[Test ${i + 1}: ${t.name}] Subject: "${t.subject}"`);
  console.log(` -> Category: ${result.category} (Confidence: ${(result.classificationConfidence * 100).toFixed(0)}%)`);
  console.log(` -> Reason: ${result.classificationReason}`);
  console.log(` -> Topic: ${result.topic}`);
  console.log(` -> Intent: ${result.intent}`);
  console.log(` -> Action Required: ${result.requiresAction ? `YES ("${result.requiredAction}")` : 'NO'}`);
  console.log(` -> Priority: ${result.priority} (${result.importanceScore}/100)`);
  console.log(` -> AI Summary: "${result.aiSummary}"`);
  console.log(` -> Keywords: ${JSON.stringify(result.keywords)}`);
  console.log(` -> Key Phrases: ${JSON.stringify(result.keyPhrases)}`);
  console.log(` -> Entities: ${JSON.stringify(result.entities)}`);
});
